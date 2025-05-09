@echo off
:: 输出日志：开始添加更改
echo 正在将所有更改添加到暂存区...
git add .
echo 更改已添加到暂存区。

:: 输出日志：开始提交更改
echo 正在提交更改...
git commit -m "update"
echo 更改已提交。

:: 输出日志：推送到默认远程仓库（origin）
echo 正在推送到默认远程仓库（origin）...
git push
echo 默认远程仓库（origin）推送完成。

:: 输出日志：推送到指定的远程 GitHub 仓库
echo 正在推送到指定的远程 GitHub 仓库...
git push https://github.com/ewbang/ewbang.github.io.git
echo 推送到远程 GitHub 仓库完成。

:: 脚本执行完毕
echo 所有操作已完成！
