$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-StreamSha256([System.IO.Stream]$InputStream) {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try { return [System.BitConverter]::ToString($algorithm.ComputeHash($InputStream)).Replace("-", "").ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}
function Get-PathSha256([string]$FilePath) {
    $inputFile = [System.IO.File]::OpenRead($FilePath)
    try { return Get-StreamSha256 $inputFile }
    finally { $inputFile.Dispose() }
}

$toolRoot = $PSScriptRoot
$distRoot = Join-Path $toolRoot "dist"
if (!(Test-Path -LiteralPath (Join-Path $distRoot "deployment.json"))) {
    throw "Build the NAS tool before packaging."
}
$files = @(
    @{ Source = ".dockerignore"; Entry = ".dockerignore" },
    @{ Source = "Dockerfile"; Entry = "Dockerfile" },
    @{ Source = "compose.v2.example.yml"; Entry = "compose.example.yml" },
    @{ Source = "config.v2.example.json"; Entry = "config.example.json" },
    @{ Source = "DSM6-QUICKSTART.md"; Entry = "DSM6-QUICKSTART.md" },
    @{ Source = "UPDATE.md"; Entry = "UPDATE.md" }
)
foreach ($file in Get-ChildItem -LiteralPath $distRoot -Recurse -File | Sort-Object FullName) {
    if ($file.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw "Linked build files are not allowed." }
    $relative = $file.FullName.Substring($toolRoot.Length + 1).Replace("\", "/")
    $files += @{ Source = $relative; Entry = $relative }
}
$archivePath = Join-Path $toolRoot "NAS-Browser-Deploy.zip"
$partialPath = "$archivePath.partial"
if (Test-Path -LiteralPath $partialPath) { throw "An unfinished deployment package already exists: $partialPath" }
$created = $false
try {
    $stream = [System.IO.File]::Open($partialPath, [System.IO.FileMode]::CreateNew)
    $created = $true
    $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in $files) {
            $sourcePath = Join-Path $toolRoot $file.Source
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive, $sourcePath, "local-video-studio/" + $file.Entry,
                [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    } finally { $archive.Dispose(); $stream.Dispose() }

    $archive = [System.IO.Compression.ZipFile]::OpenRead($partialPath)
    try {
        if ($archive.Entries.Count -ne $files.Count) { throw "Unexpected deployment archive entry count." }
        foreach ($file in $files) {
            $entry = $archive.GetEntry("local-video-studio/" + $file.Entry)
            if (!$entry) { throw "Missing deployment entry: $($file.Entry)" }
            $entryStream = $entry.Open()
            try { $hash = Get-StreamSha256 $entryStream }
            finally { $entryStream.Dispose() }
            if ($hash -ne (Get-PathSha256 (Join-Path $toolRoot $file.Source))) {
                throw "Deployment entry differs from source: $($file.Entry)"
            }
        }
    } finally { $archive.Dispose() }
    Move-Item -LiteralPath $partialPath -Destination $archivePath -Force
    $created = $false
    $hash = Get-PathSha256 $archivePath
    [System.IO.File]::WriteAllText("$archivePath.sha256", "$hash  NAS-Browser-Deploy.zip" + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    Write-Output "Verified $($files.Count) deployment files."
    Write-Output "$hash  NAS-Browser-Deploy.zip"
} finally {
    if ($created -and (Test-Path -LiteralPath $partialPath)) { Remove-Item -LiteralPath $partialPath -Force }
}
