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
REM ===========================================================================

if "%~1"=="" (
  echo ERROR: no version given.
  echo   usage: tools\release.cmd 0.4.0
  exit /b 1
)
set VER=%~1
set ROOT=%CD%

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
echo [1/5] @xdbml/parse -^> %VER%
echo ===========================================================================
cd /d "%ROOT%\parser" || goto :fail
call npm version %VER% --no-git-tag-version --allow-same-version || goto :fail
call npm install || goto :fail
call npm test || goto :fail
call npm publish || goto :fail

echo.
echo   waiting for the registry to serve %VER% ...
set /a TRIES=0
:waitparse
set /a TRIES+=1
call npm view @xdbml/parse@%VER% version --prefer-online >nul 2>&1
if not errorlevel 1 goto :parseready
if !TRIES! GEQ 30 (
  echo ERROR: @xdbml/parse@%VER% still not visible after 5 minutes.
  echo        Check https://www.npmjs.com/package/@xdbml/parse then rerun from step 2.
  goto :fail
)
timeout /t 10 /nobreak >nul
goto :waitparse
:parseready
echo   @xdbml/parse@%VER% is live.

REM ===========================================================================
echo.
echo [2/5] @xdbml/render -^> %VER%
echo ===========================================================================
cd /d "%ROOT%\renderer" || goto :fail
call npm version %VER% --no-git-tag-version --allow-same-version || goto :fail
call npm pkg set dependencies.@xdbml/parse=^^^^%VER% || goto :fail
call npm install || goto :fail
call npm run test:all || goto :fail
call npm publish || goto :fail

echo.
echo   waiting for the registry to serve %VER% ...
set /a TRIES=0
:waitrender
set /a TRIES+=1
call npm view @xdbml/render@%VER% version --prefer-online >nul 2>&1
if not errorlevel 1 goto :renderready
if !TRIES! GEQ 30 (
  echo ERROR: @xdbml/render@%VER% still not visible after 5 minutes.
  echo        Check https://www.npmjs.com/package/@xdbml/render then rerun from step 3.
  goto :fail
)
timeout /t 10 /nobreak >nul
goto :waitrender
:renderready
echo   @xdbml/render@%VER% is live.

REM ===========================================================================
echo.
echo [3/5] MCP server: dependency bump, checks, deploy
echo ===========================================================================
cd /d "%ROOT%\mcp" || goto :fail
call npm pkg set dependencies.@xdbml/parse=^^^^%VER% || goto :fail
call npm pkg set dependencies.@xdbml/render=^^^^%VER% || goto :fail
call npm version %VER% --no-git-tag-version --allow-same-version || goto :fail
REM SERVER_VERSION reads package.json, so there is no second place to bump.
call npm install --include=dev || goto :fail
call npm run check:reference || goto :fail
call npm run type-check || goto :fail
call npm test || goto :fail
call npx wrangler deploy || goto :fail

REM ===========================================================================
echo.
echo [4/5] Rendering API: dependency bump, check, deploy
echo ===========================================================================
cd /d "%ROOT%\api" || goto :fail
call npm pkg set dependencies.@xdbml/render=^^^^%VER% || goto :fail
call npm install --include=dev || goto :fail
call npm run type-check || goto :fail
call npx wrangler deploy || goto :fail

REM ===========================================================================
echo.
echo [5/5] Verify what is live
echo ===========================================================================
cd /d "%ROOT%" || goto :fail
call npm view @xdbml/parse dist-tags --prefer-online
call npm view @xdbml/render dist-tags --prefer-online
call npm view @xdbml/render dependencies --prefer-online

echo.
echo ============================================================
echo  Done. Every version and lockfile changed on disk.
echo  Commit them, then tag and publish the GitHub release:
echo.
echo    git add -A
echo    git commit -m "release %VER%"
echo    git push
echo    tools\github-release.cmd %VER%
echo ============================================================
cd /d "%ROOT%"
exit /b 0

:fail
echo.
echo ============================================================
echo  FAILED in %CD%
echo  Nothing after this point ran. Fix the error above, then
echo  rerun this script: completed steps are idempotent
echo  (--allow-same-version) except an npm publish that already
echo  succeeded, which will report "cannot publish over" -- in
echo  that case start from the next step by hand.
echo ============================================================
cd /d "%ROOT%"
exit /b 1
