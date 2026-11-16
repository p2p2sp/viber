# Drives other interactive Claude Code sessions on this Windows machine through their console,
# with no window focus: AttachConsole + ReadConsoleOutputCharacter reads the screen,
# WriteConsoleInput types keys. Sessions come from <config>\sessions\<pid>.json, written by Claude Code itself.
# Called by factory.sh, which passes the arguments base64-encoded (NUL separated) so Polish text survives.
param([Parameter(Mandatory = $true)][string]$Command, [string]$ArgsB64 = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$argv = @()
if ($ArgsB64) { $argv = @(([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ArgsB64))) -split "`0" | Where-Object { $_ -ne '' }) }
$cfg = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }

$KeyPauseMs = 150    # the TUI drops keys that arrive in one burst; 150 ms apart is reliable
$RenderWaitMs = 700  # time for the TUI to redraw before the screen is read back

Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class Con {
  [StructLayout(LayoutKind.Explicit, CharSet = CharSet.Unicode)] public struct KEY {
    [FieldOffset(0)] public int down; [FieldOffset(4)] public ushort repeat; [FieldOffset(6)] public ushort vk;
    [FieldOffset(8)] public ushort scan; [FieldOffset(10)] public char ch; [FieldOffset(12)] public uint ctrl; }
  [StructLayout(LayoutKind.Explicit)] public struct REC { [FieldOffset(0)] public ushort type; [FieldOffset(4)] public KEY key; }
  [StructLayout(LayoutKind.Sequential)] public struct COORD { public short X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct SMALL { public short L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct INFO { public COORD size, cursor; public ushort attr; public SMALL win; public COORD max; }
  [DllImport("kernel32.dll")] static extern bool FreeConsole();
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AttachConsole(uint pid);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern IntPtr CreateFile(string n, uint a, uint s, IntPtr sa, uint c, uint f, IntPtr t);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool WriteConsoleInput(IntPtr h, REC[] r, uint n, out uint w);
  [DllImport("kernel32.dll")] static extern bool GetConsoleScreenBufferInfo(IntPtr h, out INFO i);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool ReadConsoleOutputCharacter(IntPtr h, StringBuilder b, uint n, COORD c, out uint r);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint c, uint t);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern short VkKeyScan(char c);

  static IntPtr Open(uint pid, string name) {
    FreeConsole();
    if (!AttachConsole(pid)) throw new Exception("AttachConsole(" + pid + ") failed, error " + Marshal.GetLastWin32Error());
    IntPtr h = CreateFile(name, 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
    if (h == new IntPtr(-1)) { FreeConsole(); throw new Exception("open " + name + " failed"); }
    return h;
  }
  static void Close(IntPtr h) { CloseHandle(h); FreeConsole(); }

  public static REC[] Key(ushort vk, char ch, uint ctrl) {
    var r = new REC[2];
    for (int i = 0; i < 2; i++) { r[i].type = 1; r[i].key.down = i == 0 ? 1 : 0; r[i].key.repeat = 1; r[i].key.vk = vk;
      r[i].key.scan = (ushort)MapVirtualKey(vk, 0); r[i].key.ch = ch; r[i].key.ctrl = ctrl; }
    return r;
  }
  public static REC[] Text(string s) {
    var l = new List<REC>();
    // Any char needing more than Shift (AltGr letters such as a-ogonek) goes as VK_PACKET (0xE7), as Windows itself
    // sends Unicode input; a layout vk without its modifiers is read as a different key (Ctrl+G opened an editor).
    // Printable ASCII only: the session reads a key event by its vk, and no vk/char combination tried delivers a
    // non-ASCII character without focus (callers transliterate first).
    foreach (char c in s) { short v = VkKeyScan(c);
      if (c < 0x20 || c > 0x7E || v == -1 || (v & 0x600) != 0) throw new Exception("character U+" + ((int)c).ToString("X4") + " cannot be typed; only printable ASCII");
      l.AddRange(Key((ushort)(v & 0xFF), c, (v & 0x100) != 0 ? 0x10u : 0u)); }
    return l.ToArray();
  }
  // Each group is one write; pauseMs between groups.
  public static void Write(uint pid, List<REC[]> groups, int pauseMs) {
    IntPtr h = Open(pid, "CONIN$");
    try {
      foreach (var g in groups) { uint w; if (!WriteConsoleInput(h, g, (uint)g.Length, out w)) throw new Exception("WriteConsoleInput failed, error " + Marshal.GetLastWin32Error()); System.Threading.Thread.Sleep(pauseMs); }
    } finally { Close(h); }
  }
  public static string[] Screen(uint pid) {
    IntPtr h = Open(pid, "CONOUT$");
    try {
      INFO i; GetConsoleScreenBufferInfo(h, out i);
      var lines = new List<string>();
      for (int y = i.win.T; y <= i.win.B; y++) {
        var b = new StringBuilder(i.size.X + 1); uint r; var c = new COORD(); c.X = 0; c.Y = (short)y;
        ReadConsoleOutputCharacter(h, b, (uint)i.size.X, c, out r);
        lines.Add(b.ToString(0, (int)Math.Min(r, (uint)b.Length)).TrimEnd());
      }
      return lines.ToArray();
    } finally { Close(h); }
  }
}
"@

function Fail([string]$msg) { Write-Output "ERROR: $msg"; exit 1 }

function Get-SelfPid {
  # The claude.exe that owns this script; never a target. Claude Code exports CLAUDE_PID, the process tree is the fallback.
  if ($env:CLAUDE_PID) { return [int]$env:CLAUDE_PID }
  $procs = @{}; Get-CimInstance Win32_Process | ForEach-Object { $procs[[int]$_.ProcessId] = $_ }
  $p = $PID
  while ($procs.ContainsKey($p)) {
    if ($procs[$p].Name -eq 'claude.exe') { return $p }
    $parent = [int]$procs[$p].ParentProcessId
    if ($parent -eq $p) { break }; $p = $parent
  }
  return 0
}

$clientsDir = Join-Path $cfg 'factory\clients'  # written by the factoryclient skill's enroll.sh

function Get-Sessions {
  $dir = Join-Path $cfg 'sessions'
  if (-not (Test-Path $dir)) { Fail "no session registry at $dir" }
  $self = Get-SelfPid
  $live = @{}
  foreach ($f in Get-ChildItem $dir -Filter '*.json') {
    try { $s = Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json } catch { continue }
    $proc = Get-Process -Id $s.pid -ErrorAction SilentlyContinue
    if (-not $proc -or $proc.ProcessName -ne 'claude') { continue }  # stale registry file
    $live["$($s.pid)"] = "$($s.procStart)"
    $enroll = Join-Path $clientsDir "$($s.pid).json"
    $client = $false
    if (Test-Path $enroll) { try { $client = (Get-Content $enroll -Raw | ConvertFrom-Json).procStart -eq "$($s.procStart)" } catch { } }
    $s | Add-Member -NotePropertyName self -NotePropertyValue ($s.pid -eq $self)
    $s | Add-Member -NotePropertyName client -NotePropertyValue $client -PassThru
  }
  # An enrollment whose process ended, or whose pid now belongs to another process, is void.
  if (Test-Path $clientsDir) {
    foreach ($e in Get-ChildItem $clientsDir -Filter '*.json') {
      $p = $e.BaseName
      $keep = $live.ContainsKey($p) -and $(try { (Get-Content $e.FullName -Raw | ConvertFrom-Json).procStart -eq $live[$p] } catch { $false })
      if (-not $keep) { Remove-Item $e.FullName -ErrorAction SilentlyContinue }
    }
  }
}

function Resolve-Session([string]$ref, [switch]$AnyLive) {
  if (-not $ref) { Fail 'missing session (name or pid)' }
  $all = @(Get-Sessions | Where-Object { $AnyLive -or $_.client -or $_.self })
  $hit = @($all | Where-Object { $_.name -eq $ref -or "$($_.pid)" -eq $ref })
  if ($hit.Count -eq 0) { $hit = @($all | Where-Object { $_.name -like "$ref*" }) }
  if ($hit.Count -eq 0) { Fail "no enrolled session '$ref'; run list (a session enrolls by running /viber:factoryclient)" }
  if ($hit.Count -gt 1) { Fail "'$ref' matches several sessions: $(($hit | ForEach-Object { $_.name }) -join ', ')" }
  if ($hit[0].self) { Fail "'$ref' is this factory session itself" }
  return $hit[0]
}

function Show-Screen($s, [int]$n) {
  $lines = [Con]::Screen([uint32]$s.pid)
  $last = $lines.Count - 1
  while ($last -ge 0 -and $lines[$last] -eq '') { $last-- }
  $first = [Math]::Max(0, $last - $n + 1)
  Write-Output "== screen $($s.name) (pid $($s.pid)), last $n lines"
  if ($last -ge 0) { $lines[$first..$last] }
}

function Parse-Keys([string]$spec) {
  $named = @{ UP = 0x26; DOWN = 0x28; LEFT = 0x25; RIGHT = 0x27; ENTER = 0x0D; TAB = 0x09; ESC = 0x1B; SPACE = 0x20; BACKSPACE = 0x08; HOME = 0x24; END = 0x23 }
  $chars = @{ ENTER = [char]13; TAB = [char]9; ESC = [char]27; SPACE = ' '; BACKSPACE = [char]127 }  # a terminal Backspace is DEL; 0x08 reads as Ctrl+H
  $groups = New-Object 'System.Collections.Generic.List[Con+REC[]]'
  foreach ($tok in ($spec -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })) {
    $t = $tok.ToUpperInvariant()
    if ($t -eq 'SHIFT+TAB') { $groups.Add([Con]::Key(0x09, [char]9, 0x10)) }
    elseif ($named.ContainsKey($t)) { $ch = if ($chars.ContainsKey($t)) { [char]$chars[$t] } else { [char]0 }; $groups.Add([Con]::Key([uint16]$named[$t], $ch, 0)) }
    elseif ($tok.Length -eq 1) { $groups.Add([Con]::Text($tok)) }
    else { Fail "unknown key '$tok'; use $(($named.Keys + 'SHIFT+TAB') -join ' ') or one character" }
  }
  return ,$groups
}

function ConvertTo-Ascii([string]$text) {
  $map = @{ [char]0x0142 = 'l'; [char]0x0141 = 'L'; [char]0x201E = '"'; [char]0x201D = '"'; [char]0x201C = '"'; [char]0x2019 = "'"; [char]0x2018 = "'"
            [char]0x2013 = '-'; [char]0x2014 = '-'; [char]0x2026 = '...'; [char]0x00A0 = ' '; [char]0x00AB = '"'; [char]0x00BB = '"' }
  $sb = New-Object Text.StringBuilder
  foreach ($c in $text.Normalize([Text.NormalizationForm]::FormD).ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($c) -eq 'NonSpacingMark') { continue }
    if ($map.ContainsKey($c)) { [void]$sb.Append($map[$c]) } else { [void]$sb.Append($c) }
  }
  return $sb.ToString()
}

function Send-Groups($s, $groups) {
  [Con]::Write([uint32]$s.pid, $groups, $KeyPauseMs)
  Start-Sleep -Milliseconds $RenderWaitMs
  Show-Screen $s 25
}

function Find-Transcript($s) {
  $hit = Get-ChildItem (Join-Path $cfg 'projects') -Recurse -Filter "$($s.sessionId).jsonl" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $hit) { Fail "no transcript for session $($s.sessionId)" }
  return $hit.FullName
}

function Show-Pending($s) {
  $open = [ordered]@{}
  foreach ($line in Get-Content (Find-Transcript $s) -Tail 400 -Encoding UTF8) {
    if ($line -notmatch '"tool_use"|"tool_result"') { continue }
    try { $e = $line | ConvertFrom-Json } catch { continue }
    if ($e.isSidechain -or -not $e.message -or $e.message.content -isnot [array]) { continue }
    foreach ($c in $e.message.content) {
      if ($c.type -eq 'tool_use') { $open[$c.id] = $c }
      elseif ($c.type -eq 'tool_result' -and $open.Contains($c.tool_use_id)) { $open.Remove($c.tool_use_id) }
    }
  }
  Write-Output "== pending $($s.name): status $($s.status)$(if ($s.waitingFor) { " ($($s.waitingFor))" })"
  if ($open.Count -eq 0) { Write-Output 'no unanswered tool call in the transcript'; return }
  $t = @($open.Values)[-1]
  Write-Output "tool: $($t.name)"
  switch ($t.name) {
    'AskUserQuestion' {
      $i = 0
      foreach ($q in $t.input.questions) {
        $i++; Write-Output "Q$i [$($q.header)] $($q.question)$(if ($q.multiSelect) { ' (multiSelect)' })"
        $j = 0; foreach ($o in $q.options) { $j++; Write-Output "  $j. $($o.label) - $($o.description)" }
      }
    }
    'ExitPlanMode' {
      $plan = "$($t.input.plan)"
      if ($plan.Length -gt 4000) { $plan = $plan.Substring(0, 4000) + ' [...]' }
      if ($plan) { Write-Output $plan } else { Write-Output ($t.input | ConvertTo-Json -Depth 6 -Compress) }
    }
    default {
      $json = $t.input | ConvertTo-Json -Depth 6 -Compress
      if ($json.Length -gt 1500) { $json = $json.Substring(0, 1500) + ' [...]' }
      Write-Output $json
    }
  }
}

function Watch-Sessions([string[]]$refs) {
  $timeout = 540  # stays under the 10-minute cap of one Bash call
  $rest = @()
  for ($k = 0; $k -lt $refs.Count; $k++) { if ($refs[$k] -eq '--timeout') { $timeout = [int]$refs[$k + 1]; $k++ } else { $rest += $refs[$k] } }
  $pids = @($rest | ForEach-Object { (Resolve-Session $_).pid })  # by pid: sessions rename themselves
  # An idle state is reported once per statusUpdatedAt, remembered across calls, so a turn that ended
  # before this watch started is still reported, and never twice.
  $seenFile = Join-Path $cfg 'factory\idle-seen.json'
  $seen = @{}
  if (Test-Path $seenFile) { try { (Get-Content $seenFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $seen[$_.Name] = "$($_.Value)" } } catch { } }
  $deadline = (Get-Date).AddSeconds($timeout)
  while ((Get-Date) -lt $deadline) {
    $events = @()
    foreach ($s in @(Get-Sessions | Where-Object { $_.client -and -not $_.self -and ($pids.Count -eq 0 -or $pids -contains $_.pid) })) {
      if ($s.status -eq 'waiting') { $events += "WAITING $($s.name) (pid $($s.pid)): $($s.waitingFor)" }
      elseif ($s.status -eq 'idle' -and $seen["$($s.pid)"] -ne "$($s.statusUpdatedAt)") {
        $events += "IDLE $($s.name) (pid $($s.pid)): finished its turn"; $seen["$($s.pid)"] = "$($s.statusUpdatedAt)"
      }
    }
    if ($events.Count) {
      New-Item -ItemType Directory -Force (Split-Path $seenFile) | Out-Null
      $seen | ConvertTo-Json | Set-Content $seenFile -Encoding UTF8
      $events; return
    }
    Start-Sleep -Seconds 2
  }
  Write-Output "TIMEOUT after $timeout s: no session waiting or newly idle"
}

switch ($Command) {
  'list' {
    foreach ($s in @(Get-Sessions | Sort-Object name)) {
      $wait = if ($s.waitingFor) { " ($($s.waitingFor))" } else { '' }
      $tag = if ($s.self) { '  [self]' } elseif ($s.client) { '  [client]' } else { '' }
      Write-Output ("{0}  pid {1}  {2}{3}  {4}{5}" -f $s.name, $s.pid, $s.status, $wait, $s.cwd, $tag)
    }
  }
  'screen'  { $n = if ($argv.Count -gt 1) { [int]$argv[1] } else { 40 }; Show-Screen (Resolve-Session $argv[0]) $n }
  'pending' { Show-Pending (Resolve-Session $argv[0]) }
  'keys'    { $s = Resolve-Session $argv[0]; Send-Groups $s (Parse-Keys ($argv[1..($argv.Count - 1)] -join ',')) }
  'type'    { $s = Resolve-Session $argv[0]; $g = New-Object 'System.Collections.Generic.List[Con+REC[]]'; $g.Add([Con]::Text((ConvertTo-Ascii ($argv[1..($argv.Count - 1)] -join ' ')))); Send-Groups $s $g }
  'send'    {
    $s = Resolve-Session $argv[0]
    $text = ConvertTo-Ascii (($argv[1..($argv.Count - 1)] -join ' ') -replace '\r?\n', ' ')  # Enter submits, so a newline would send early
    $g = New-Object 'System.Collections.Generic.List[Con+REC[]]'; $g.Add([Con]::Text($text)); $g.Add([Con]::Key(0x0D, [char]13, 0))
    Send-Groups $s $g
  }
  'enroll'  {
    $s = Resolve-Session $argv[0] -AnyLive
    if ($s.client) { Write-Output "ALREADY ENROLLED pid $($s.pid) ($($s.name))"; break }
    if ($s.status -ne 'idle') { Fail "pid $($s.pid) is $($s.status); enroll only an idle session, its input line must be free" }
    $g = New-Object 'System.Collections.Generic.List[Con+REC[]]'; $g.Add([Con]::Text('/viber:factoryclient')); $g.Add([Con]::Key(0x0D, [char]13, 0))
    [Con]::Write([uint32]$s.pid, $g, $KeyPauseMs)
    $deadline = (Get-Date).AddSeconds(60)  # the session needs one model turn to run the skill
    while ((Get-Date) -lt $deadline) {
      if (@(Get-Sessions | Where-Object { $_.pid -eq $s.pid -and $_.client }).Count) { Write-Output "ENROLLED pid $($s.pid) ($($s.name))"; break }
      Start-Sleep -Seconds 2
    }
    if ((Get-Date) -ge $deadline) { Show-Screen $s 15; Fail "pid $($s.pid) did not enroll within 60 s; see the screen above" }
  }
  'watch'   { Watch-Sessions $argv }
  default   { Fail "unknown command '$Command'; use list|screen|pending|keys|type|send|watch" }
}
