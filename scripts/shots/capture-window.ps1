# Captures one desktop app's own window (never the whole desktop) with PrintWindow.
#   capture-window.ps1 -Exe <path> [-Arguments <string>] -Out <png> [-Width 1280 -Height 800] [-Wait 8]
# The window is resized to Width x Height (device pixels) before capture. Leaves the app running
# unless -Close is given, so a caller can capture it again after something changes.
param(
    [string]$Exe,
    [string]$Arguments = '',
    [int]$ProcessId = 0,
    [Parameter(Mandatory)] [string]$Out,
    [int]$Width = 1280,
    [int]$Height = 800,
    [int]$Wait = 8,
    [switch]$Close
)

Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Win {
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT r);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int w, int h, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int cmd);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT r, int size);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@

if ($ProcessId -gt 0) {
    $proc = Get-Process -Id $ProcessId
} else {
    $proc = if ($Arguments) { Start-Process -FilePath $Exe -ArgumentList $Arguments -PassThru } else { Start-Process -FilePath $Exe -PassThru }
}

$deadline = (Get-Date).AddSeconds(60)
while ($proc.MainWindowHandle -eq 0 -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 300; $proc.Refresh() }
if ($proc.MainWindowHandle -eq 0) { throw "no window for process $($proc.Id)" }
$hwnd = $proc.MainWindowHandle

[Win]::ShowWindow($hwnd, 9) | Out-Null  # SW_RESTORE
[Win]::SetWindowPos($hwnd, [IntPtr]::Zero, 40, 40, $Width, $Height, 0x0044) | Out-Null  # NOZORDER|SHOWWINDOW
Start-Sleep -Seconds $Wait

# Crop to the visible frame (DWM bounds), which excludes the invisible resize border.
$win = New-Object Win+RECT; [Win]::GetWindowRect($hwnd, [ref]$win) | Out-Null
$vis = New-Object Win+RECT; [Win]::DwmGetWindowAttribute($hwnd, 9, [ref]$vis, 16) | Out-Null
$w = $win.Right - $win.Left; $h = $win.Bottom - $win.Top
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc(); [Win]::PrintWindow($hwnd, $hdc, 3) | Out-Null; $g.ReleaseHdc($hdc); $g.Dispose()
$crop = New-Object System.Drawing.Rectangle ($vis.Left - $win.Left), ($vis.Top - $win.Top), ($vis.Right - $vis.Left), ($vis.Bottom - $vis.Top)
$bmp.Clone($crop, $bmp.PixelFormat).Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "pid=$($proc.Id) saved $Out ($($crop.Width)x$($crop.Height))"

if ($Close) { $proc.CloseMainWindow() | Out-Null }
