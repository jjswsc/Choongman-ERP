# ESC/POS 바이트 파일을 WinSpool RAW로 한 번 전송한다(드라이버 GDI 렌더링 우회 — 래스터 인쇄 모드).
param(
  [Parameter(Mandatory = $true)]
  [string] $PrinterName,

  [Parameter(Mandatory = $true)]
  [string] $FilePath
)

$ErrorActionPreference = "Stop"

$data = [System.IO.File]::ReadAllBytes($FilePath)
if ($data.Length -eq 0) {
  throw "ESC/POS raw: empty data"
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class EscPosRawFile {
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
      di.pDocName = "POS Receipt (ESC/POS raster)";
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
            if (written != data.Length)
              throw new Exception("WritePrinter: partial write " + written + "/" + data.Length);
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

[EscPosRawFile]::Send($PrinterName, $data)
exit 0
