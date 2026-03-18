@echo off
chcp 65001 >nul

:: Pula uma linha e adiciona a data e hora no final do README.md
echo. >> README.md
echo --- >> README.md
echo *Última atualização: %date% às %time:~0,5%* >> README.md

:: Comandos do Git
echo Preparando arquivos...
git add .

echo Criando o pacote (Commit)...
git commit -m "Atualizacao automatica: %date% %time:~0,5%"

echo Enviando para o GitHub...
git push origin main

echo.
echo ✅ Código atualizado e enviado para o GitHub com sucesso!