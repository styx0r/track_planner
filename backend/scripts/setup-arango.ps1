#Requires -Version 5.1

<#
.SYNOPSIS
    Sets up ArangoDB database, user, and collections for track_planner.
.DESCRIPTION
    Creates the database with an application user and required collections (music, playlists).
    Safe to run multiple times - will skip existing resources.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

# Configuration (can be overridden via environment variables)
$ArangoUrl = if ($env:ARANGO_URL) { $env:ARANGO_URL } else { "http://localhost:8529" }
$RootUser = if ($env:ARANGO_ROOT_USER) { $env:ARANGO_ROOT_USER } else { "root" }
$RootPass = if ($env:ARANGO_ROOT_PASSWORD) { $env:ARANGO_ROOT_PASSWORD } else { "track_planner" }
$DbName = if ($env:ARANGO_DB_NAME) { $env:ARANGO_DB_NAME } else { "track-planner" }
$AppUser = if ($env:ARANGO_APP_USER) { $env:ARANGO_APP_USER } else { "track-planner" }
$AppPass = if ($env:ARANGO_APP_PASSWORD) { $env:ARANGO_APP_PASSWORD } else { "track-planner" }
$CollectionName = if ($env:ARANGO_COLLECTION_NAME) { $env:ARANGO_COLLECTION_NAME } else { "music" }

function Get-BasicAuthHeader {
    param(
        [string]$Username,
        [string]$Password
    )
    $pair = "${Username}:${Password}"
    $bytes = [System.Text.Encoding]::ASCII.GetBytes($pair)
    $base64 = [System.Convert]::ToBase64String($bytes)
    return @{ Authorization = "Basic $base64" }
}

Write-Host "Setting up ArangoDB database..."

# Create database with app user
$createPayload = @{
    name = $DbName
    users = @(
        @{
            username = $AppUser
            passwd = $AppPass
            active = $true
        }
    )
} | ConvertTo-Json -Depth 3

$rootAuthHeader = Get-BasicAuthHeader -Username $RootUser -Password $RootPass

try {
    $response = Invoke-WebRequest -Uri "${ArangoUrl}/_api/database" `
        -Method Post `
        -Headers $rootAuthHeader `
        -ContentType "application/json" `
        -Body $createPayload `
        -UseBasicParsing

    if ($response.StatusCode -eq 201) {
        Write-Host "Database '$DbName' created with user '$AppUser'"
    }
}
catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 409) {
        Write-Host "Database '$DbName' already exists, skipping creation."
    }
    else {
        Write-Host "Failed to create database (status $statusCode):"
        Write-Host $_.ErrorDetails.Message
        exit 1
    }
}

# Create 'music' collection
$appAuthHeader = Get-BasicAuthHeader -Username $AppUser -Password $AppPass

$collectionPayload = @{
    name = $CollectionName
    type = 2
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "${ArangoUrl}/_db/${DbName}/_api/collection" `
        -Method Post `
        -Headers $appAuthHeader `
        -ContentType "application/json" `
        -Body $collectionPayload `
        -UseBasicParsing

    if ($response.StatusCode -eq 200) {
        Write-Host "Collection '$CollectionName' created."
    }
}
catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 409) {
        Write-Host "Collection '$CollectionName' already exists, skipping creation."
    }
    else {
        Write-Host "Failed to create collection (status $statusCode):"
        Write-Host $_.ErrorDetails.Message
        exit 1
    }
}

# Create 'playlists' collection
$playlistPayload = @{
    name = "playlists"
    type = 2
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "${ArangoUrl}/_db/${DbName}/_api/collection" `
        -Method Post `
        -Headers $appAuthHeader `
        -ContentType "application/json" `
        -Body $playlistPayload `
        -UseBasicParsing

    if ($response.StatusCode -eq 200) {
        Write-Host "Collection 'playlists' created."
    }
}
catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 409) {
        Write-Host "Collection 'playlists' already exists, skipping creation."
    }
    else {
        Write-Host "Failed to create 'playlists' collection (status $statusCode):"
        Write-Host $_.ErrorDetails.Message
        exit 1
    }
}

Write-Host "Setup complete!"

