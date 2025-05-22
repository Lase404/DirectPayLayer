Write-Host "Creating token images..."

# Create the images directory if it doesn't exist
if (-not (Test-Path "public/images")) {
    New-Item -ItemType Directory -Path "public/images" -Force | Out-Null
    Write-Host "Created directory public/images"
}

# Create a WebClient object for downloading
$webClient = New-Object System.Net.WebClient

# Define the image URLs and destinations
$images = @(
    @{ URL = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/eth.png"; Dest = "public/images/eth.png" },
    @{ URL = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdc.png"; Dest = "public/images/usdc.png" },
    @{ URL = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdt.png"; Dest = "public/images/usdt.png" },
    @{ URL = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/dai.png"; Dest = "public/images/dai.png" },
    @{ URL = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/btc.png"; Dest = "public/images/wbtc.png" },
    @{ URL = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/sol.png"; Dest = "public/images/sol.png" }
)

# Download each image
foreach ($image in $images) {
    try {
        Write-Host "Downloading $($image.URL) to $($image.Dest)"
        $webClient.DownloadFile($image.URL, (Join-Path (Get-Location) $image.Dest))
        if (Test-Path $image.Dest) {
            Write-Host "Successfully downloaded to $($image.Dest)"
        } else {
            Write-Host "Download completed but file not found at $($image.Dest)"
        }
    } catch {
        Write-Host "Failed to download $($image.URL): $_"
        # Create a blank image as fallback
        try {
            $blankImage = [byte[]]::new(100)
            [System.IO.File]::WriteAllBytes((Join-Path (Get-Location) $image.Dest), $blankImage)
            Write-Host "Created blank placeholder at $($image.Dest)"
        } catch {
            Write-Host "Failed to create blank placeholder: $_"
        }
    }
}

Write-Host "Creating token-placeholder.svg"
try {
    @"
<svg width='32' height='32' viewBox='0 0 32 32' fill='none' xmlns='http://www.w3.org/2000/svg'>
  <circle cx='16' cy='16' r='16' fill='#ECEFF1'/>
  <path d='M16 8L19.09 14.26L26 15.27L21 20.14L22.18 27.02L16 23.77L9.82 27.02L11 20.14L6 15.27L12.91 14.26L16 8Z' fill='#B0BEC5'/>
</svg>
"@ | Out-File -FilePath "public/images/token-placeholder.svg" -Encoding UTF8
    Write-Host "Created token-placeholder.svg"
} catch {
    Write-Host "Failed to create token-placeholder.svg: $_"
}

# List all files in the images directory
Write-Host "Files in public/images directory:"
Get-ChildItem "public/images" | ForEach-Object { Write-Host $_.Name } 