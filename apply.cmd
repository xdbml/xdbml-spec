@echo off
setlocal
REM xDBML 0.6.7: quoted names in every name position, diagnostics copy.
REM The files of this delivery were edited in place in this clone, so there is
REM nothing to unzip and nothing to check against a base: apply.cmd runs the
REM verification gate and prints the commands to commit and release. It does
REM not commit, push or publish.
set "ROOT=%~dp0"
cd /d "%ROOT%" || exit /b 1
if not exist "parser\src\parser.ts" (
  echo ERROR: run apply.cmd from the root of the xdbml-spec clone.
  exit /b 1
)

echo.
echo [1/2] Verification gate (npm run check, mcp type-check)
call npm run check || goto :fail
cd /d "%ROOT%mcp" || goto :fail
call npm run type-check || goto :fail

cd /d "%ROOT%"
echo.
echo [2/2] Done. Gate green. Nothing is committed yet.
echo ============================================================
echo  To commit and release, from %ROOT%:
echo.
echo    git add -A
echo    git commit -m "0.6.7: quoted names in every name position, diagnostics copy"
echo    tools\release-preflight.cmd 0.6.7
echo    tools\release.cmd 0.6.7
echo.
echo  release.cmd pushes main and the tag itself: no git push before it.
echo ============================================================
exit /b 0

:fail
cd /d "%ROOT%"
echo.
echo The gate failed: the step above names the failing suite. Nothing is
echo committed. Send me the output.
exit /b 1
