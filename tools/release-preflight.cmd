@echo off
setlocal enabledelayedexpansion

REM ===========================================================================
REM  xDBML release preflight.
REM
REM  Usage, from the repo root:
REM      tools\release-preflight.cmd 0.4.0
REM
REM  Checks everything tools\release.cmd will need, and changes nothing. Run it
REM  first: the only point at which stopping costs nothing is before the first
REM  publish, because a published version can never be republished.
REM ===========================================================================

if "%~1"=="" (
  echo ERROR: no version given.
  echo   usage: tools\release-preflight.cmd 0.4.0
  exit /b 1
)
set VER=%~1
set ROOT=%CD%
set PROBLEMS=0

echo.
echo ============================================================
echo  Preflight for %VER%
echo ============================================================

REM --- repo root -------------------------------------------------------------
if not exist "%ROOT%\parser\package.json" (
  echo [FAIL] run this from the repo root, not from tools\.
  exit /b 1
)
echo [ok]   repo root

REM --- npm login -------------------------------------------------------------
call npm whoami >nul 2>&1
if errorlevel 1 (
  echo [FAIL] not logged in to npm.  Fix: npm login
  set /a PROBLEMS+=1
) else (
  for /f %%u in ('npm whoami') do echo [ok]   npm login: %%u
)

REM --- publish rights on the scope -------------------------------------------
call npm access list packages @xdbml >nul 2>&1
if errorlevel 1 (
  echo [WARN] could not read @xdbml scope access. If publish fails with 403,
  echo        this is why.
) else (
  echo [ok]   @xdbml scope readable
)

REM --- version is not already published --------------------------------------
call npm view @xdbml/parse@%VER% version >nul 2>&1
if not errorlevel 1 (
  echo [FAIL] @xdbml/parse@%VER% is ALREADY published. Pick a higher version:
  echo        npm view @xdbml/parse versions --json
  set /a PROBLEMS+=1
) else (
  echo [ok]   @xdbml/parse@%VER% is free
)
call npm view @xdbml/render@%VER% version >nul 2>&1
if not errorlevel 1 (
  echo [FAIL] @xdbml/render@%VER% is ALREADY published. Pick a higher version.
  set /a PROBLEMS+=1
) else (
  echo [ok]   @xdbml/render@%VER% is free
)

REM --- wrangler, via npx (it is a local devDependency, not global) ------------
if not exist "%ROOT%\mcp\node_modules\wrangler" (
  echo [WARN] mcp dependencies not installed yet. Fix: cd mcp ^&^& npm install --include=dev
)
cd /d "%ROOT%\mcp" 2>nul
call npx --no-install wrangler whoami >nul 2>&1
if errorlevel 1 (
  echo [FAIL] wrangler is not authenticated, or not installed.
  echo        Fix: cd mcp ^&^& npm install --include=dev ^&^& npx wrangler login
  set /a PROBLEMS+=1
) else (
  echo [ok]   wrangler authenticated
)
cd /d "%ROOT%"

REM --- dev tooling present ---------------------------------------------------
if not exist "%ROOT%\mcp\node_modules\.bin\tsc.cmd" (
  echo [FAIL] mcp: tsc missing, so dev dependencies are not installed.
  echo        Usually NODE_ENV=production or a persisted npm `omit` setting.
  echo        Fix: set NODE_ENV=  ^&^&  cd mcp ^&^& npm install --include=dev
  set /a PROBLEMS+=1
) else (
  echo [ok]   mcp dev tooling present
)
if not exist "%ROOT%\api\node_modules\.bin\tsc.cmd" (
  echo [WARN] api dev tooling missing. Fix: cd api ^&^& npm install --include=dev
)

REM --- environment that silently drops dev deps ------------------------------
if /i "%NODE_ENV%"=="production" (
  echo [FAIL] NODE_ENV=production drops devDependencies from every npm install.
  echo        Fix for this shell: set NODE_ENV=
  set /a PROBLEMS+=1
) else (
  echo [ok]   NODE_ENV not forcing production
)

REM --- generated MCP reference in sync ---------------------------------------
cd /d "%ROOT%\mcp" 2>nul
call npm run check:reference >nul 2>&1
if errorlevel 1 (
  echo [FAIL] mcp/src/reference.ts has drifted from public/llms.txt.
  echo        Fix: cd mcp ^&^& npm run generate:reference   then commit it.
  set /a PROBLEMS+=1
) else (
  echo [ok]   MCP reference in sync with public/llms.txt
)
cd /d "%ROOT%"

REM --- everything green ------------------------------------------------------
echo.
echo   running the test suites (this takes a minute) ...
call npm test >nul 2>&1
if errorlevel 1 (
  echo [FAIL] npm test failed. Run `npm test` to see which suite.
  set /a PROBLEMS+=1
) else (
  echo [ok]   all test suites pass
)

REM --- clean git tree --------------------------------------------------------
for /f %%s in ('git status --porcelain ^| find /c /v ""') do set DIRTY=%%s
if not "%DIRTY%"=="0" (
  echo [WARN] %DIRTY% uncommitted changes. The release edits versions and
  echo        lockfiles, so commit or stash first to keep the diff readable.
)

echo.
echo ============================================================
if "%PROBLEMS%"=="0" (
  echo  Preflight clean. Run:  tools\release.cmd %VER%
) else (
  echo  Problems found above: %PROBLEMS%. Fix them before releasing.
)
echo.
echo  Expected and NOT a problem: `npm install` reporting
echo  vulnerabilities in wrangler -^> miniflare -^> sharp / undici.
echo  That chain is the local Worker emulator and is never bundled.
echo  The number that matters is `npm audit --omit=dev`, which
echo  should report 0 in both mcp and api.
echo ============================================================

if "%PROBLEMS%"=="0" exit /b 0
exit /b 1
