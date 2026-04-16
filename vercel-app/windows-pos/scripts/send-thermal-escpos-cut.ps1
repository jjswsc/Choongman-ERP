# ESC/POS: WinSpool RAW로 피드 + 절단. 제조사·펌웨어마다 인식하는 명령이 달라 여러 시퀀스를 순서대로 시도한다.
# (다른 POS/유틸은 자체 드라이버/SDK로 보내는 경우가 많아, 여기서는 Win32 RAW 호환에 맞춤)
param(
  [Parameter(Mandatory = $true)]
  [string] $PrinterName
)

$ErrorActionPreference = "Stop"

# 각 항목: 바이트 배열. 1순위는 예전 단일 시퀀스 — ESC @ 선행은 일부 기기에서 GDI 인쇄 직후 이중 절단·빈 토출을 유발할 수 있어 뒤로 뺌.
$variants = @(
  [byte[]]@(0x1B, 0x64, 0x05, 0x1D, 0x56, 0x00),
  [byte[]]@(0x1B, 0x64, 0x08, 0x1D, 0x56, 0x00),
  [byte[]]@(0x1B, 0x64, 0x05, 0x1D, 0x56, 0x01),
  [byte[]]@(0x0A, 0x0A, 0x0A, 0x1B, 0x64, 0x06, 0x1D, 0x56, 0x00),
  [byte[]]@(0x1D, 0x56, 0x41, 0x30),
  [byte[]]@(0x1B, 0x64, 0x05, 0x1D, 0x56, 0x42, 0x00),
  [byte[]]@(0x1B, 0x40, 0x1B, 0x64, 0x0A, 0x1D, 0x56, 0x00),
  [byte[]]@(0x1B, 0x40, 0x1B, 0x64, 0x08, 0x1D, 0x56, 0x01)
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class EscPosRawCut {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFO di);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static void Send(string printer, byte[] data) {
    IntPtr h = IntPtr.Zero;
    if (!OpenPrinter(printer, out h, IntPtr.Zero))
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "OpenPrinter");
    try {
      DOCINFO di = new DOCINFO();
      di.pDocName = "ESC/POS Cut";
      di.pOutputFile = null;
      di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, ref di))
        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "StartDocPrinter");
      try {
        if (!StartPagePrinter(h))
          throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "StartPagePrinter");
        try {
          IntPtr buf = Marshal.AllocCoTaskMem(data.Length);
          try {
            Marshal.Copy(data, 0, buf, data.Length);
            int written;
            if (!WritePrinter(h, buf, data.Length, out written))
              throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "WritePrinter");
          } finally {
            Marshal.FreeCoTaskMem(buf);
          }
        } finally {
          EndPagePrinter(h);
        }
      } finally {
        EndDocPrinter(h);
      }
    } finally {
      ClosePrinter(h);
    }
  }
}
"@

$lastEx = $null
$idx = 0
foreach ($bytes in $variants) {
  $idx++
  try {
    [EscPosRawCut]::Send($PrinterName, $bytes)
    exit 0
  } catch {
    $lastEx = $_
    # 첫 시도에서 OpenPrinter 실패면(큐 이름 오류 등) 시퀀스를 바꿔도 동일하므로 즉시 종료
    if ($idx -eq 1) {
      $inner = $_.Exception.InnerException
      if ($inner -is [System.ComponentModel.Win32Exception]) {
        $n = [uint32]$inner.NativeErrorCode
        if ($n -eq 1801) { throw $_ }
      }
    }
    if ($idx -lt $variants.Count) {
      Start-Sleep -Milliseconds 100
    }
  }
}

if ($null -ne $lastEx) {
  throw $lastEx
}
throw "ESC/POS cut: no variant succeeded"
