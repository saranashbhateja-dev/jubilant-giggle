@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Install Node.js 22 or newer first.& pause & exit /b 1)
where java >nul 2>nul || (echo Install JDK 21 and Android Studio / Android SDK first.& pause & exit /b 1)
call npm install
if errorlevel 1 goto fail
call npm run build
if errorlevel 1 goto fail
if not exist android\gradlew.bat call npx cap add android
if errorlevel 1 goto fail
call npx cap sync android
if errorlevel 1 goto fail
pushd android
call gradlew.bat assembleDebug
if errorlevel 1 (popd & goto fail)
popd
echo.
echo APK built at: android\app\build\outputs\apk\debug\app-debug.apk
pause
exit /b 0
:fail
echo Android build failed. Check the error output above.
pause
exit /b 1
