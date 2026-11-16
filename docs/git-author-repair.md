# Git 提交归属修正

2026-11-16。用户要求把此前提交归到 GitHub 账号 `ChlorophyllC`，提供的提交邮箱为 `cookie4830@163.com`。

## 本次范围

- 将之前 29 条项目提交的作者与提交者统一为 `ChlorophyllC <cookie4830@163.com>`，修正本机邮箱和 `codex@localhost` 的错误归属。
- 保留各提交的作者日期、提交者日期、文件树、提交消息和父子顺序；不回填或伪造日期。
- 对应版本标签改为指向修正后的提交，带注释标签的署名一并修正。标签名称、说明和版本文件树保持不变。
- 原提交哈希会改变，旧说明中引用的历史哈希属于修正前记录，原 29 条提交及标签的对应关系见 [历史映射](git-author-history-map.json)。本轮整理提交本身不在这份事前快照内。
- 本仓库本地配置固定使用上述姓名/邮箱并开启 `user.useConfigOnly`，不修改全局 Git 身份。

GitHub 根据提交邮箱关联账号，用户应确认此邮箱已添加至自己的 GitHub 账号。贡献图等展示可能存在更新延迟；见 [GitHub 归属说明](https://docs.github.com/en/pull-requests/how-tos/commit-changes/troubleshooting-commits)。

## 本地撤回内容

按用户选择，保留删除旧 `launch-03` 及移除其文档引用的操作。`launch-01/sunseek-xiaohongshu-launch/` 是已有 ZIP 解压副本，保留磁盘文件、撤出暂存并忽略，避免重复提交图片；正式成图和可重建 ZIP 仍按原方式保留。

## 备份与验证

改动前在本机 `.git/sunseek-identity-backup-20261116-ecdea04c/` 保存完整 Git bundle、原暂存与未暂存二进制补丁、原 index 和引用记录。实际重写前另存 bundle，实际映射也保存在该备份目录。这些是本机恢复资料，不提交到公开仓库。

修正时逐条比较文件树、提交消息与两个原始时间戳；所有版本标签也逐一比较文件树。远程更新使用精确旧哈希的 `--force-with-lease` 和原子推送，远程如有并发更新则停止，不覆盖未知改动。

如另有本项目的旧克隆，应先备份各自未提交内容，再协调到新历史，不直接把旧分支合并回去。当前网站和云资源不受此次 Git 元数据整理影响。
