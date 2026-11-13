Add-Type -AssemblyName System.Drawing

function New-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-FragileIcon([int]$size, [string]$outPath) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  # latar kotak membulat
  $pad = [single]($size * 0.02)
  $bg = New-RoundedPath $pad $pad ($size - $pad * 2) ($size - $pad * 2) ([single]($size * 0.22))
  $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 17, 24, 39))
  $g.FillPath($bgBrush, $bg)

  # segitiga peringatan
  $tri = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p1 = New-Object System.Drawing.PointF(($size * 0.50), ($size * 0.17))
  $p2 = New-Object System.Drawing.PointF(($size * 0.85), ($size * 0.79))
  $p3 = New-Object System.Drawing.PointF(($size * 0.15), ($size * 0.79))
  $tri.AddPolygon(@($p1, $p2, $p3))
  $amber = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 245, 158, 11))
  $g.FillPath($amber, $tri)

  # tanda seru
  $barW = [single][Math]::Max(1.2, $size * 0.085)
  $barTop = [single]($size * 0.37)
  $barH = [single]($size * 0.24)
  $ink = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 17, 24, 39))
  $bar = New-RoundedPath ([single]($size * 0.5 - $barW / 2)) $barTop $barW $barH ([single]($barW / 2))
  $g.FillPath($ink, $bar)

  $dot = [single]($size * 0.085)
  $g.FillEllipse($ink, [single]($size * 0.5 - $dot / 2), [single]($size * 0.665), $dot, $dot)

  $g.Dispose()
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dir = Join-Path $root 'icons'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

foreach ($s in 16, 32, 48, 128) {
  New-FragileIcon $s (Join-Path $dir "icon$s.png")
}

Write-Host "Icons created in $dir"
