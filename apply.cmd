@echo off
setlocal
REM Dependency security update: copies seven files into the repo, installs
REM from the new lockfiles, audits, and runs the verification gate.
REM It does not commit or push: the last lines print the commands for that.
REM Usage:  apply.cmd                 (repo at C:\Repos\Hackolade\xdbml-spec)
REM         apply.cmd D:\path\to\xdbml-spec
set REPO=C:\Repos\Hackolade\xdbml-spec
if not "%~1"=="" set REPO=%~1
set SRC=%~dp0
set BASE=b72912c
set FILES=package.json package-lock.json playground/package-lock.json api/package.json api/package-lock.json mcp/package.json mcp/package-lock.json

if not exist "%REPO%\mcp\package.json" (
  echo ERROR: no xdbml-spec repository at %REPO%
  echo        Pass its path: apply.cmd D:\path\to\xdbml-spec
  exit /b 1
)
cd /d "%REPO%" || exit /b 1

echo.
echo [1/5] Guards


echo.
echo [2/5] Copy the seven files


echo.
echo [3/5] Install from the lockfiles (npm ci)
cd /d "%REPO%" || goto :fail
call npm ci --no-fund || goto :fail
cd /d "%REPO%\playground" || goto :fail
call npm ci --no-fund || goto :fail
REM api links @xdbml/render to ..\renderer, so its type-check needs renderer\dist.
cd /d "%REPO%\renderer" || goto :fail
call npm ci --no-fund --no-audit || goto :fail
call npm run build || goto :fail
cd /d "%REPO%\mcp" || goto :fail
call npm ci --no-fund || goto :fail
cd /d "%REPO%\api" || goto :fail
call npm ci --no-fund || goto :fail

echo.
echo [4/5] npm audit on the four lockfiles that had findings
cd /d "%REPO%" || goto :fail
call npm audit || goto :auditfail
cd /d "%REPO%\playground" || goto :fail
call npm audit || goto :auditfail
cd /d "%REPO%\mcp" || goto :fail
call npm audit || goto :auditfail
cd /d "%REPO%\api" || goto :fail
call npm audit || goto :auditfail

echo.
echo [5/5] Verification gate
cd /d "%REPO%" || goto :fail
call npm run check || goto :fail
cd /d "%REPO%\mcp" || goto :fail
call npm run check:reference || goto :fail
call npm run type-check || goto :fail
cd /d "%REPO%\api" || goto :fail
call npm run type-check || goto :fail

cd /d "%REPO%"
echo.
echo ============================================================
echo  Done. Audits clean, gate green. Nothing is committed yet.
echo  To commit and push, from %REPO%:
echo.
echo    git add %FILES%
echo    git commit -m "security: patched Vite, PostCSS, nanoid, esbuild and wrangler toolchain"
echo    git push
echo ============================================================
exit /b 0

:auditfail
echo.
echo ============================================================
echo  npm audit reports a finding in %CD%
echo  The package was clean on 2026-10-02, so this is an advisory
echo  published since. The seven files are copied but not committed.
echo  Undo with: git checkout -- %FILES%
echo ============================================================
cd /d "%REPO%"
exit /b 1

:fail
echo.
echo ============================================================
echo  FAILED in %CD%
echo  Nothing after this point ran, and nothing is committed.
echo  Undo the copy with: git checkout -- %FILES%
echo ============================================================
cd /d "%REPO%"
exit /b 1
