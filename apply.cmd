@echo off
setlocal
REM Renderer: automatic arrangement, beside before across a corner, rows for a landscape view.
REM Run from the repo root after unzipping the delivery there. apply.cmd copies
REM nothing: it checks the unzipped files, then runs the verification gate. It
REM does not commit or push: the last lines print the commands for that.
set "ROOT=%~dp0"
cd /d "%ROOT%" || exit /b 1
set BASE=e836600
set EDITED=APPLY.txt apply.cmd CHANGELOG.md renderer/src/layout/auto-arrange.ts renderer/test/run-tests.ts renderer/test/goldens/01-blog.svg renderer/test/goldens/02-ecommerce.svg renderer/test/goldens/04-social-graph.svg renderer/test/goldens/05-healthcare-fhir.svg renderer/test/goldens/06-financial-services.svg renderer/test/goldens/07-project-management.svg renderer/test/goldens/08-university-registrar.svg renderer/test/goldens/09-modules-conformed-dimensions.svg renderer/test/goldens/10-modules-consumer.svg renderer/test/goldens/11-modules-remote.svg renderer/test/goldens/12-conceptual-to-denormalized.svg renderer/test/goldens/13-foreign-master-denormalization.svg renderer/test/goldens/14-supertype-groups.svg renderer/test/goldens/15-constraints.svg renderer/test/goldens/16-diagram-views.svg renderer/test/goldens/17-internal-definitions.svg

if not exist ".git" (
  echo ERROR: apply.cmd is not at the root of a clone of xdbml-spec.
  echo        Unzip the archive at the repo root, then run apply.cmd there.
  exit /b 1
)
if not exist "parser\src\parser.ts" (
  echo ERROR: %ROOT% does not look like the xdbml-spec repository.
  exit /b 1
)

echo.
echo [1/3] Guards
git merge-base --is-ancestor %BASE% HEAD
if errorlevel 1 (
  echo ERROR: %BASE% is not in the history of HEAD. Run git pull, unzip again, then run apply.cmd.
  exit /b 1
)
git diff --quiet %BASE% HEAD -- %EDITED%
if errorlevel 1 (
  echo ERROR: a commit since %BASE% changed one of this delivery's files, and the unzip
  echo        has overwritten that change. Restore it with git checkout HEAD -- ^<file^>
  echo        and ask for a delivery based on HEAD.
  exit /b 1
)
REM Each file holds this delivery's content (apply.cmd itself excepted).
call :sum APPLY.txt 1f75b99f0f928ecdeb51be8b310ab8652603b5d3 || exit /b 1
call :sum CHANGELOG.md c27ae87a7928ad0f31f30f571ab4938ab5236012 || exit /b 1
call :sum renderer/src/layout/auto-arrange.ts c19aa6b4cc833b7770771b9197eaf9ad90160c94 || exit /b 1
call :sum renderer/test/run-tests.ts ead5cc9b9c749879f5affbbfefad49c5a88350ed || exit /b 1
call :sum renderer/test/goldens/01-blog.svg 970fccf90c676e84b144a4f98db3d040c15d179b || exit /b 1
call :sum renderer/test/goldens/02-ecommerce.svg 31ae0f913ef9b13d054769131fdc4ba014d831fc || exit /b 1
call :sum renderer/test/goldens/04-social-graph.svg 02f4900fc608ed87b1b34771f30d04574923695c || exit /b 1
call :sum renderer/test/goldens/05-healthcare-fhir.svg 3deb5cf14c45801f747bed1d3657ad07277ec8c8 || exit /b 1
call :sum renderer/test/goldens/06-financial-services.svg e80135eaf8ed8077f7a560a1a0ef7f10b3c0ee53 || exit /b 1
call :sum renderer/test/goldens/07-project-management.svg 6f5f6a9ac01b692c8267292e246b4e2972c91478 || exit /b 1
call :sum renderer/test/goldens/08-university-registrar.svg 24a8b356c0c305d06ea2239381ed5b5966a494d0 || exit /b 1
call :sum renderer/test/goldens/09-modules-conformed-dimensions.svg 38666bcda0523521ddca2b51b8249d3ff6d5ecd8 || exit /b 1
call :sum renderer/test/goldens/10-modules-consumer.svg 58e78304a370f890953b3e148526e0b3008f69ad || exit /b 1
call :sum renderer/test/goldens/11-modules-remote.svg 24079a440e1e0b853bba0e02106d102f75819741 || exit /b 1
call :sum renderer/test/goldens/12-conceptual-to-denormalized.svg b9f4896e0ac815d3791fe10141d9793eff1c8084 || exit /b 1
call :sum renderer/test/goldens/13-foreign-master-denormalization.svg d965099a25771763307664fffec1121d72de4f3c || exit /b 1
call :sum renderer/test/goldens/14-supertype-groups.svg 4ca730a9080d65bf40f5b70866fb6d18db11350f || exit /b 1
call :sum renderer/test/goldens/15-constraints.svg 94f66b0b31813b5a498193aaaf9fd4dcdcd632d9 || exit /b 1
call :sum renderer/test/goldens/16-diagram-views.svg 3eb3712f5f420232053bc4fc0cebe321d60b1751 || exit /b 1
call :sum renderer/test/goldens/17-internal-definitions.svg 78986ccd4193db2078da81445a5f75fe4cb713ee || exit /b 1

REM The working tree holds no change outside this delivery.
set "LIST=%TEMP%\xdbml-delivery-files.txt"
set "CHANGED=%TEMP%\xdbml-changed-files.txt"
set "EXTRA=%TEMP%\xdbml-extra-files.txt"
(for %%F in (%EDITED%) do @echo %%F) > "%LIST%"
git diff --name-only HEAD > "%CHANGED%"
git ls-files --others --exclude-standard >> "%CHANGED%"
findstr /v /x /l /i /g:"%LIST%" "%CHANGED%" > "%EXTRA%"
for %%S in ("%EXTRA%") do if %%~zS gtr 0 (
  echo ERROR: the working tree holds changes outside this delivery:
  type "%EXTRA%"
  echo        Commit, stash or discard them, then run apply.cmd again.
  exit /b 1
)
echo        Base, contents and working tree as expected.

echo.
echo [2/3] Verification gate (npm run check, mcp type-check)
call npm run check || goto :fail
cd /d "%ROOT%mcp" || goto :fail
call npm run type-check || goto :fail

cd /d "%ROOT%"
echo.
echo [3/3] Done. Gate green. Nothing is committed yet.
echo ============================================================
echo  To commit and push, from %ROOT%:
echo.
echo    git add %EDITED%
echo    git commit -m "renderer: automatic arrangement, beside before across a corner, rows for a landscape view"
echo    git push
echo ============================================================
exit /b 0

:sum
REM %1 is a repo-relative path, %2 the blob hash git computes for its content.
set "P=%~1"
set "P=%P:/=\%"
if not exist "%P%" (
  echo ERROR: %P% is missing. Unzip the whole archive at the repo root.
  exit /b 1
)
set "H="
for /f %%H in ('git hash-object "%~1"') do set "H=%%H"
if /i not "%H%"=="%~2" (
  echo ERROR: %P% does not hold this delivery's content. Unzip the archive again.
  exit /b 1
)
exit /b 0

:fail
cd /d "%ROOT%"
echo.
echo ============================================================
echo  FAILED. Nothing is committed.
echo  To take the delivery back out:
echo    git checkout -- %EDITED%
echo ============================================================
exit /b 1
