@echo off
echo ====================================
echo     Open Data Backend Runner
echo ====================================
echo.
echo Select mode:
echo 1. Development (recommended)
echo 2. Production
echo 3. Debug
echo 4. Exit
echo.
set /p choice="Enter your choice (1-4): "

if "%choice%"=="1" (
    echo Starting development server...
    npm run start:dev
) else if "%choice%"=="2" (
    echo Building and starting production server...
    call npm run build
    npm run start:prod
) else if "%choice%"=="3" (
    echo Starting debug server...
    npm run start:debug
) else if "%choice%"=="4" (
    echo Goodbye!
    exit /b 0
) else (
    echo Invalid choice. Please try again.
    pause
    goto :start
)

echo.
echo Press any key to exit...
pause >nul