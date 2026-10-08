param(
    [Parameter(Mandatory=$true)][string]$Project,
    [Parameter(Mandatory=$true)][string]$SourceBackup,
    [Parameter(Mandatory=$true)][string]$Destination,
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
if ($Project -notmatch '^[a-z][a-z0-9-]{4,62}$') { throw 'Projeto invalido.' }
if ($Destination -notmatch '^gelato-homolog-[0-9]{8}(-[a-z0-9]+)?$') {
    throw 'O destino precisa ser um banco novo gelato-homolog-AAAAMMDD. O banco de producao nunca e destino permitido.'
}
if ($SourceBackup -notmatch "^projects/$Project/locations/([a-z0-9-]+)/backups/([a-z0-9-]+)$") { throw 'Backup de origem invalido ou de outro projeto.' }
$backupLocation = $Matches[1]
$backupId = $Matches[2]
$metadataJson = & gcloud firestore backups describe --project=$Project --location=$backupLocation --backup=$backupId --format=json --quiet
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel consultar o backup.' }
$metadata = ($metadataJson -join "`n") | ConvertFrom-Json
if ($metadata.state -ne 'READY' -or $metadata.database -ne "projects/$Project/databases/(default)") { throw 'A copia deve estar READY e pertencer ao banco principal informado.' }
$databasesJson = & gcloud firestore databases list --project=$Project --format=json --quiet
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel verificar os bancos existentes.' }
$databases = ($databasesJson -join "`n") | ConvertFrom-Json
if (@($databases | Where-Object { $_.name -eq "projects/$Project/databases/$Destination" }).Count -gt 0) { throw 'O banco de destino ja existe. Nenhuma sobrescrita e permitida.' }
[ordered]@{ project=$Project; source=$SourceBackup; snapshot=$metadata.snapshotTime; destination=$Destination; apply=[bool]$Apply } | ConvertTo-Json
if ($Apply) {
    & gcloud firestore databases restore --project=$Project --source-backup=$SourceBackup --destination-database=$Destination --format=json --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar a restauracao. Verifique a operacao antes de repetir.' }
}
