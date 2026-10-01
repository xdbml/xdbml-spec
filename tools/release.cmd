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
REM  After a failure, rerun the same command. Nothing is published twice: a
REM  package already on npm at this version, or published by an earlier run
REM  (a marker file in %TEMP% records it), skips install, test and publish.
REM  Every other step can run twice. npm can take many minutes to serve a new
REM  version, metadata first and tarball later, so after each publish the
REM  script waits until both are served (up to 45 minutes), and retries each
REM  npm install for up to 15 minutes. The last step commits, pushes, and runs
REM  tools\github-release.cmd, which tags and publishes the GitHub release,
REM  then deletes the markers.
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

REM --- guard: curl, which ships with Windows 10 and later -------------------
where curl >nul 2>&1
if errorlevel 1 (
  echo ERROR: curl not found. It ships with Windows 10 and later, in System32.
  exit /b 1
)

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
  goto :parsepublished
)
if exist "%MARK%-parse.published" (
  echo   @xdbml/parse@%VER% was published by an earlier run: skipping install,
  echo   test and publish.
  goto :parsepublished
)
call :install || goto :fail
call npm test || goto :fail
call npm publish || goto :fail
type nul > "%MARK%-parse.published"
:parsepublished
call :waitlive parse || goto :fail

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
  goto :renderpublished
)
if exist "%MARK%-render.published" (
  echo   @xdbml/render@%VER% was published by an earlier run: skipping install,
  echo   test and publish.
  goto :renderpublished
)
call :install --prefer-online || goto :fail
call npm run test:all || goto :fail
call npm publish || goto :fail
type nul > "%MARK%-render.published"
:renderpublished
call :waitlive render || goto :fail

REM ===========================================================================
echo.
echo [3/6] MCP server: dependency bump, checks, deploy
echo ===========================================================================
cd /d "%ROOT%\mcp" || goto :fail
call npm pkg set dependencies.@xdbml/parse=^^^^%VER% || goto :fail
call npm pkg set dependencies.@xdbml/render=^^^^%VER% || goto :fail
call npm version %VER% --no-git-tag-version --allow-same-version || goto :fail
REM SERVER_VERSION reads package.json, so there is no second place to bump.
call :install --include=dev --prefer-online || goto :fail
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
call :install --include=dev --prefer-online || goto :fail
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
echo  Nothing after this point ran. Rerun the same command:
echo  nothing is published twice, and every other step can run
echo  again. If the error above is not about npm being slow to
echo  serve a package, fix its cause first.
echo ============================================================
cd /d "%ROOT%"
exit /b 1

REM ===========================================================================
REM  :waitlive NAME
REM  Waits until npm serves @xdbml/NAME at this version in full: its metadata, read by
REM  npm view, and its tarball, which the registry's CDN can serve many
REM  minutes after the metadata. npm install needs the tarball, so the next
REM  step starts only once a plain download of it succeeds. Up to 45 minutes.
REM ===========================================================================
:waitlive
set "WL_NAME=%~1"
set "WL_URL=https://registry.npmjs.org/@xdbml/%WL_NAME%/-/%WL_NAME%-%VER%.tgz"
echo.
echo   waiting for npm to serve @xdbml/%WL_NAME%@%VER%, metadata and tarball
echo   (up to 45 minutes; npm can take a while after a publish) ...
set /a WL_TRIES=0
:waitlive_loop
set /a WL_TRIES+=1
set WL_META=no
call npm view @xdbml/%WL_NAME%@%VER% version --prefer-online >nul 2>&1
if not errorlevel 1 set WL_META=yes
set WL_TGZ=no
curl -sfL -o nul "%WL_URL%" >nul 2>&1
if not errorlevel 1 set WL_TGZ=yes
if "!WL_META!!WL_TGZ!"=="yesyes" (
  echo   @xdbml/%WL_NAME%@%VER% is live: metadata and tarball.
  exit /b 0
)
if !WL_TRIES! GEQ 270 (
  echo ERROR: npm still does not serve @xdbml/%WL_NAME%@%VER% after 45 minutes
  echo        ^(metadata: !WL_META!, tarball: !WL_TGZ!^). Check the e-mail of the
  echo        npm account and https://www.npmjs.com/package/@xdbml/%WL_NAME%,
  echo        then rerun the same command: it waits again, without publishing.
  exit /b 1
)
set /a WL_MOD=WL_TRIES %% 6
if !WL_MOD! EQU 0 (
  set /a WL_MIN=WL_TRIES / 6
  echo   still waiting after !WL_MIN! minute^(s^): metadata !WL_META!, tarball !WL_TGZ! ...
)
timeout /t 10 /nobreak >nul
goto :waitlive_loop

REM ===========================================================================
REM  :install, with the arguments for npm install
REM  npm install, retried every 10 seconds for up to 15 minutes: right after a
REM  publish, npm can still answer ETARGET or a 404 on the tarball from one
REM  edge of its CDN while another serves it.
REM ===========================================================================
:install
set /a IN_TRIES=0
:install_loop
set /a IN_TRIES+=1
call npm install %* && exit /b 0
if !IN_TRIES! GEQ 90 (
  echo ERROR: npm install still fails after 15 minutes. Read the npm error above.
  exit /b 1
)
echo   npm install did not succeed yet ^(try !IN_TRIES! of 90^); retrying in 10 seconds ...
timeout /t 10 /nobreak >nul
goto :install_loop
