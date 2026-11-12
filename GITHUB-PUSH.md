# 推到 GitHub（手机端也可完成）

本机已经配好 **SSH 免密推送通道**（用 pip 的 paramiko 实现，因为 apt 源不通）。
你只需要做两件在浏览器里的事。

## 1. 建一个空仓库

手机浏览器打开 <https://github.com/new>：

- **Repository name**：`signature-studio`
- **Public / Private** 都行（Private 也能推）
- ⚠️ **不要**勾选 Add a README / .gitignore / license（必须是空仓库，否则 push 会冲突）
- 点 **Create repository**

## 2. 把公钥加进去（二选一）

**A. 账号级（推荐，以后所有仓库都能用）**
开 <https://github.com/settings/keys> → **New SSH key**
- Title：`签名工坊-手机`
- Key type：`Authentication key`
- Key：粘贴下面的整行

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJLT7a4Ws6C7jKmovWahwlHF1KhQa3WrnUYnbBL6MiMr signature-studio@dsh
```

**B. 仓库级（只给这一个仓库写权限，更保守）**
刚建的仓库 → **Settings** → **Deploy keys** → **Add deploy key**
- 粘贴同一行公钥
- ✅ 勾选 **Allow write access**
- Add key

## 3. 告诉我仓库地址

回复格式：`github.com/<你的用户名>/signature-studio`（或直接说"用户名 + signature-studio"）。

我这边执行：

```bash
git remote add origin git@github.com:<用户名>/signature-studio.git
GIT_SSH_COMMAND="python3 ~/.ssh/git-ssh" git push -u origin main
```

推完 GitHub Actions 会自动开始构建 APK（见 `.github/workflows/build-apk.yml`），
在仓库的 **Actions** 页面能看到运行结果，Artifacts 里下载 `app-debug.apk`。

## 说明

- **私钥只存在这台手机的 `~/.ssh/id_ed25519`**，从未离开设备；你贴到 GitHub 的是公钥，泄露也无风险。
- 连接固定走 `ssh.github.com:443`（GitHub 的 SSH-over-HTTPS 端口），并校验 GitHub 官方 ed25519 主机指纹。
- 不想用 SSH 的话，也可以用 Personal Access Token 走 HTTPS，但那样令牌会出现在命令里，不推荐在这台设备上做。
