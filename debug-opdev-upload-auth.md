# [OPEN] opdev-upload-auth

## 问题
- 症状：`opdev upload ./dist` 在不同尝试下出现 `Not logged in`、`Not allowed to upload block`、`self-signed certificate in certificate chain`
- 预期：使用正确环境与登录态后，能够成功上传 docs add-on block

## 环境
- 项目目录：`/Users/bytedance/timeline`
- 操作系统：macOS
- 当前关注命令：`opdev login` / `opdev upload ./dist`

## 假设
- H1：`opdev login` 与 `opdev upload` 使用了不同的 HOME/配置目录，导致上传进程看不到登录态
- H2：登录环境选错，当前应用属于 `lark` 环境，但已有登录态来自 `feishu`
- H3：`opdev` 在读取/写入 `~/.mpdev-cli` 与项目内 `.opdev-home` 时，实际使用的配置文件位置与预期不一致
- H4：存在网络证书/代理干扰，导致登录请求未真正完成，但 CLI 没有给出清晰的最终成功标志
- H5：即使登录成功，上传调用的账号/环境与 block 所属应用不一致，导致进入平台后被判定无效或无权

## 证据采集计划
- 检查 `opdev` 可执行路径与版本
- 检查 `HOME`、`XDG`、`.mpdev-cli` 目录、登录态文件和时间戳
- 对比 `whoami`、`login`、`upload` 在 `default HOME` 与 `.opdev-home` 下的行为差异
- 必要时抓取 CLI 读取的配置路径与发起的目标环境

## 进展
- 已确认 `/opt/homebrew/bin/opdev` 可执行，默认 `HOME=/Users/bytedance` 会因写 `/Users/bytedance/.mpdev-cli/logs` 报 `EPERM`
- 已确认项目隔离目录 `/Users/bytedance/timeline/.opdev-home/.mpdev-cli` 被实际使用
- 已确认 `opdev login -e lark` 在 `11:03:13` 成功：日志出现 `Account.login.login.success`
- 已确认 `opdev upload ./dist` 在 `11:03:45` 成功完成：日志出现 `Upload.uploadBlock.upload.end`
- 已确认后续再次运行时，`StorageUtilsV2.Cipher.decrypt` 对 `storage.sec.json` 报 `ERR_OSSL_BAD_DECRYPT`
- 已确认一旦解密失败，CLI 会回退到空账号状态，表现为 `whoami -> Not login`，并重新把环境初始化成默认 `feishu`

## 当前判断
- H1：部分成立。默认 HOME 与项目 HOME 混用确实让现象更混乱，但不是唯一根因
- H2：已证实。应用属于 `lark`，`feishu` 环境会走错平台
- H3：已证实。CLI 使用的真实缓存目录是 `.mpdev-home/.mpdev-cli`
- H4：已证实。证书链问题会干扰登录与 FG/Update 请求，但不是“已登录后又消失”的根因
- H5：被证伪。至少有一轮上传请求已经以 `lark` 环境、正确 appId/blockTypeId 成功跑到 `upload.end`

## 根因
- 底层根因是 `storage.sec.json` 的加密内容在后续进程中无法被 CLI 解密，日志明确报 `ERR_OSSL_BAD_DECRYPT`
- 直接后果是 CLI 读不到 `accountInfo`，因此 `whoami`/`upload` 会误判成 `Not login`
- 在重建干净 `.opdev-home` 后，又暴露出第二层问题：`opdev login -e lark` 虽然生成了 `redirectUrl=http://localhost:57875/login`，但本地端口并未实际监听，`curl` 证实 `127.0.0.1:57875` 与 `::1:57875` 都是 `Connection refused`
- 因此当前这一轮登录卡住的直接原因不是用户没点登录，而是 CLI 本地回调服务器没有真正起来

## 试验性修复
- 已在 `/Users/bytedance/timeline/.opdev-home/.mpdev-cli/fg.json` 中移除 `opdev.storage.v2`
- 已删除损坏的 `storage.sec.json`
- 目标：强制 CLI 回退到旧版 `storage.json` 存储链路，绕过 `type=system` 解密失败
