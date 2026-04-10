# ESC/POS: feed a few lines + full cut. Sent as RAW so Zywell 등 GDI/HTML만으로는 컷이 안 나오는 기기에 대응.
param(
  [Parameter(Mandatory = $true)]
  [string] $PrinterName
)

$ErrorActionPreference = "Stop"

# ESC d 5 = feed 5 lines, GS V 0 = full cut (일반 ESC/POS)
$bytes = [byte[]]@(0x1B, 0x64, 0x05, 0x1D, 0x56, 0x00)

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

[EscPosRawCut]::Send($PrinterName, $bytes)
