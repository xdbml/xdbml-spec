@echo off
setlocal enabledelayedexpansion

REM ===========================================================================
REM  xDBML release: publish @xdbml/parse and @xdbml/render, deploy mcp and api.
REM
REM  Usage, from the repo root:
REM      tools\release.cmd 0.4.0
REM
REM  Every version bump and dependency-range change is done by this script
REM  through `npm version` and `npm pkg set`. Nothing here asks you to edit a
REM  file, and the script stops at the first failure rather than carrying on
REM  into a broken state.
REM
REM  Run tools\release-preflight.cmd first. It checks everything this script
REM  needs before anything is published, which is the only point where
REM  stopping is free.
REM
REM  After a failure, rerun the same command. A package already on npm at
REM  this version is not installed, tested or published again, and every
REM  other step can run twice. A package this script published that npm does
REM  not serve yet is waited for, not published again: a successful
REM  `npm publish` leaves a marker file in %TEMP%, and the marker sends a rerun
REM  straight to the wait. The wait lasts up to 30 minutes. The last step
REM  commits, pushes, and runs tools\github-release.cmd, which tags and
REM  publishes the GitHub release, then deletes the markers.
REM ===========================================================================

if "%~1"=="" (
  echo ERROR: no version given.
  echo   usage: tools\release.cmd 0.4.0
  exit /b 1
)
set VER=%~1
set ROOT=%CD%
REM Markers of the packages this script published at this version, so a
REM rerun waits for npm to serve them instead of publishing them again.
set MARK=%TEMP%\xdbml-release-%VER%

echo.
echo ============================================================
echo  Releasing %VER%
echo  Repo: %ROOT%
echo ============================================================

REM --- guard: must be at the repo root ---------------------------------------
if not exist "%ROOT%\parser\package.json" (
  echo ERROR: run this from the repo root, not from tools\.
  exit /b 1
)

REM ===========================================================================
echo.
echo [1/6] @xdbml/parse -^> %VER%
echo ===========================================================================
cd /d "%ROOT%\parser" || goto :fail
call npm version %VER% --no-git-tag-version --allow-same-version || goto :fail
call npm view @xdbml/parse@%VER% version --prefer-online >nul 2>&1
if not errorlevel 1 (
  echo   @xdbml/parse@%VER% is already on npm: skipping install, test and publish.
  goto :parseready
)
if exist "%MARK%-parse.published" (
  echo   @xdbml/parse@%VER% was published by an earlier run and npm does not serve
  echo   it yet: waiting for it, without installing, testing or publishing again.
  goto :waitparsestart
)
call npm install || goto :fail
call npm test || goto :fail
call npm publish || goto :fail
type nul > "%MARK%-parse.published"

:waitparsestart
echo.
echo   waiting for the registry to serve @xdbml/parse@%VER% (up to 30 minutes) ...
set /a TRIES=0
:waitparse
set /a TRIES+=1
call npm view @xdbml/parse@%VER% version --prefer-online >nul 2>&1
if not errorlevel 1 goto :parseready
if !TRIES! GEQ 180 (
  echo ERROR: @xdbml/parse@%VER% still not visible after 30 minutes.
  echo        npm accepted the upload but does not serve it. Check the e-mail of
  echo        the npm account and https://www.npmjs.com/package/@xdbml/parse,
  echo        then rerun the same command: it waits again, without publishing.
  goto :fail
)
set /a WAITMOD=TRIES %% 6
if !WAITMOD! EQU 0 (
  set /a WAITMIN=TRIES / 6
  echo   still waiting after !WAITMIN! minute^(s^) ...
)
timeout /t 10 /nobreak >nul
goto :waitparse
:parseready
echo   @xdbml/parse@%VER% is live.

REM ===========================================================================
echo.
echo [2/6] @xdbml/render -^> %VER%
echo ===========================================================================
cd /d "%ROOT%\renderer" || goto :fail
call npm version %VER% --no-git-tag-version --allow-same-version || goto :fail
call npm pkg set dependencies.@xdbml/parse=^^^^%VER% || goto :fail
call npm view @xdbml/render@%VER% version --prefer-online >nul 2>&1
if not errorlevel 1 (
  echo   @xdbml/render@%VER% is already on npm: skipping install, test and publish.
  goto :renderready
)
if exist "%MARK%-render.published" (
  echo   @xdbml/render@%VER% was published by an earlier run and npm does not serve
  echo   it yet: waiting for it, without installing, testing or publishing again.
  goto :waitrenderstart
)
REM npm view reads the registry's full metadata, npm install its abbreviated
REM metadata, which can lag behind for a few minutes after a publish and fail
REM with ETARGET. Retry the install until it resolves %VER%.
set /a TRIES=0
:installrender
set /a TRIES+=1
call npm install --prefer-online && goto :installrenderdone
if !TRIES! GEQ 18 goto :fail
echo   npm install did not resolve %VER% yet; retrying in 10 seconds ...
timeout /t 10 /nobreak >nul
goto :installrender
:installrenderdone
call npm run test:all || goto :fail
call npm publish || goto :fail
type nul > "%MARK%-render.published"

:waitrenderstart
echo.
echo   waiting for the registry to serve @xdbml/render@%VER% (up to 30 minutes) ...
set /a TRIES=0
:waitrender
set /a TRIES+=1
call npm view @xdbml/render@%VER% version --prefer-online >nul 2>&1
if not errorlevel 1 goto :renderready
if !TRIES! GEQ 180 (
  echo ERROR: @xdbml/render@%VER% still not visible after 30 minutes.
  echo        npm accepted the upload but does not serve it. Check the e-mail of
  echo        the npm account and https://www.npmjs.com/package/@xdbml/render,
  echo        then rerun the same command: it waits again, without publishing.
  goto :fail
)
set /a WAITMOD=TRIES %% 6
if !WAITMOD! EQU 0 (
  set /a WAITMIN=TRIES / 6
  echo   still waiting after !WAITMIN! minute^(s^) ...
)
timeout /t 10 /nobreak >nul
goto :waitrender
:renderready
echo   @xdbml/render@%VER% is live.

REM ===========================================================================
echo.
echo [3/6] MCP server: dependency bump, checks, deploy
echo ===========================================================================
cd /d "%ROOT%\mcp" || goto :fail
call npm pkg set dependencies.@xdbml/parse=^^^^%VER% || goto :fail
call npm pkg set dependencies.@xdbml/render=^^^^%VER% || goto :fail
call npm version %VER% --no-git-tag-version --allow-same-version || goto :fail
REM SERVER_VERSION reads package.json, so there is no second place to bump.
REM npm view reads the registry's full metadata, npm install its abbreviated
REM metadata, which can lag behind for a few minutes after a publish and fail
REM with ETARGET. Retry the install until it resolves %VER%.
set /a TRIES=0
:installmcp
set /a TRIES+=1
call npm install --include=dev --prefer-online && goto :installmcpdone
if !TRIES! GEQ 18 goto :fail
echo   npm install did not resolve %VER% yet; retrying in 10 seconds ...
timeout /t 10 /nobreak >nul
goto :installmcp
:installmcpdone
call npm run check:reference || goto :fail
call npm run type-check || goto :fail
call npm test || goto :fail
call npx wrangler deploy || goto :fail

REM ===========================================================================
echo.
echo [4/6] Rendering API: dependency bump, check, deploy
echo ===========================================================================
cd /d "%ROOT%\api" || goto :fail
call npm pkg set dependencies.@xdbml/render=^^^^%VER% || goto :fail
REM npm view reads the registry's full metadata, npm install its abbreviated
REM metadata, which can lag behind for a few minutes after a publish and fail
REM with ETARGET. Retry the install until it resolves %VER%.
set /a TRIES=0
:installapi
set /a TRIES+=1
call npm install --include=dev --prefer-online && goto :installapidone
if !TRIES! GEQ 18 goto :fail
echo   npm install did not resolve %VER% yet; retrying in 10 seconds ...
timeout /t 10 /nobreak >nul
goto :installapi
:installapidone
call npm run type-check || goto :fail
call npx wrangler deploy || goto :fail

REM ===========================================================================
echo.
echo [5/6] Verify what is live
echo ===========================================================================
cd /d "%ROOT%" || goto :fail
call npm view @xdbml/parse dist-tags --prefer-online
call npm view @xdbml/render dist-tags --prefer-online
call npm view @xdbml/render dependencies --prefer-online

REM ===========================================================================
echo.
echo [6/6] Commit, push, tag and GitHub release
echo ===========================================================================
cd /d "%ROOT%" || goto :fail
call git add -A || goto :fail
call git diff --cached --quiet
if errorlevel 1 (
  call git commit -m "release %VER%" || goto :fail
) else (
  echo   nothing to commit.
)
call git push || goto :fail
call "%ROOT%\tools\github-release.cmd" %VER% || goto :fail
del "%MARK%-parse.published" "%MARK%-render.published" >nul 2>&1

echo.
echo ============================================================
echo  Done. %VER% is published, deployed, committed and released.
echo ============================================================
cd /d "%ROOT%"
exit /b 0

:fail
echo.
echo ============================================================
echo  FAILED in %CD%
echo  Nothing after this point ran. Fix the error above, then
echo  rerun the same command: a package already on npm at this
echo  version, or published by this script and not served yet,
echo  is not published again, and every other step can run twice.
echo ============================================================
cd /d "%ROOT%"
exit /b 1
