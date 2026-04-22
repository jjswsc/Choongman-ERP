# ESC/POS: WinSpool RAW로 캐시드로어(솔레노이드) 펄스. 제조사·케이블 연결(핀0/1)에 따라 시퀀스를 순서대로 시도.
param(
  [Parameter(Mandatory = $true)]
  [string] $PrinterName
)

$ErrorActionPreference = "Stop"

$variants = @(
  [byte[]]@(0x1B, 0x70, 0x00, 0x19, 0xFA),
  [byte[]]@(0x1B, 0x70, 0x01, 0x19, 0xFA),
  [byte[]]@(0x1B, 0x70, 0x00, 0x19, 0xFF),
  [byte[]]@(0x0A, 0x0A, 0x1B, 0x70, 0x00, 0x19, 0xFA)
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class EscPosRawDrawer {
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
      di.pDocName = "ESC/POS drawer";
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
    [EscPosRawDrawer]::Send($PrinterName, $bytes)
    exit 0
  } catch {
    $lastEx = $_
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
throw "ESC/POS drawer: no variant succeeded"
