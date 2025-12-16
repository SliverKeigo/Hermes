# Hermes (赫爾墨斯) - AI API Gateway & Aggregator

**Hermes** 是一個高性能、輕量級的 AI API 網關與聚合器，旨在為開發者提供統一的 OpenAI 兼容接口，以便輕鬆管理和路由多個支持 OpenAI 協議的上游 AI 服務提供商（如 OpenAI, Google Gemini, Groq, DeepSeek 等）。

它集成了智能路由、負載均衡、健康檢查和實時日誌監控功能，確保服務的高可用性與低延遲。

## 核心特性

*   **OpenAI 協議兼容**: 提供標準的 `/v1/chat/completions` 和 `/v1/models` 接口，可直接對接任何支持 OpenAI SDK 的客戶端應用。
*   **多供應商聚合**: 支持添加無限個上游供應商（Providers），自動聚合所有可用模型。
*   **智能路由與負載均衡**:
    *   **Dispatcher**: 根據模型可用性和響應速度自動分發請求。
    *   **健康檢查**: 後台週期性任務（每 5 秒延遲保護）主動探測模型健康狀態，自動剔除故障模型。
    *   **自動恢復**: 當上游恢復時，自動將模型重新加入可用列表。
*   **穩定性與安全**:
    *   **全局限流**: 內置 IP 限流保護（默認 60 RPM）。
    *   **自動重試**: 請求失敗時自動嘗試其他可用供應商。
*   **可視化管理後台**:
    *   **Dashboard**: 直觀管理供應商、密鑰和模型黑名單。
    *   **Chat Playground**: 內置聊天測試界面，支持流式輸出（Streaming）。
    *   **日誌監控**: 實時查看 API 請求日誌和後台同步日誌，支持多條件篩選。
*   **數據持久化**: 使用 SQLite 數據庫存儲配置和日誌，輕量且易於備份。

## 快速開始

### 使用 Docker Compose (推薦)

這是最簡單的部署方式，適合生產環境和快速體驗。

1.  **克隆倉庫**:
    ```bash
    git clone https://github.com/SliverKeigo/Hermes.git
    cd Hermes
    ```

2.  **啟動服務**:
    ```bash
    docker-compose up -d
    ```

3.  **訪問服務**:
    *   **API 地址**: `http://localhost:3000`
    *   **管理後台**: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

### 本地開發 (使用 Bun)

如果您想進行二次開發或調試，可以使用 Bun 在本地運行。

1.  **安裝依賴**:
    ```bash
    bun install
    ```

2.  **啟動服務**:
    ```bash
    bun run src/index.ts
    ```
    或者開發模式（支持熱重載）：
    ```bash
    bun run dev
    ```

### 使用 Leaflow 部署

如果您使用 Leaflow 進行容器編排，可以使用以下清單進行部署：

```yaml
kind: Storage
name: pwd-data
size: 512
---
kind: Deployment
name: sliverkeigo-hermes
replicas: 1
image_pull_secrets: {  }
containers:
  -
    name: sliverkeigo-hermes
    image: 'sliverkeigo/hermes:latest'
    working_dir: ''
    command: {  }
    args: {  }
    ports:
      -
        name: port3000
        container_port: 3000
        protocol: TCP
    env:
      -
        name: HERMES_SECRET
        value: '123456'
      -
        name: DB_PATH
        value: /data/hermes.db
    env_from_configmap: {  }
    env_from_secret: {  }
    resources:
      cpu: 200
      memory: 128
    volume_mounts:
      -
        mount_path: /data
        storage_name: pwd-data
        sub_path: ''
        read_only: false
    configmap_mounts: {  }
    secret_mounts: {  }
---
kind: Service
name: sliverkeigo-hermes
type: LoadBalancer
target_workload_type: Deployment
target_workload_name: sliverkeigo-hermes
ports:
  -
    name: port3000
    port: 3000
    target_port: 3000
    protocol: TCP
session_affinity: None
external_traffic_policy: Cluster
```

注意：請根據實際情況修改 `HERMES_SECRET` 和其他配置。

## 環境變量配置

您可以在 `docker-compose.yml` 或 `.env` 文件中配置以下環境變量：

| 變量名 | 默認值 | 說明 |
| :--- | :--- | :--- |
| `PORT` | `3000` | 服務監聽端口 |
| `HERMES_SECRET` | `hermes-secret-key` | 用於加密和簽名的密鑰，生產環境請務必修改 |
| `DB_PATH` | `/data/hermes.db` | SQLite 數據庫文件路徑 |

## 使用指南

### 1. 添加供應商 (Provider)
進入 [Dashboard](http://localhost:3000/dashboard)，點擊 "添加供應商"。
*   **Base URL**: 上游服務的 API 地址 (例如 `https://api.openai.com/v1`)。
*   **API Key**: 上游服務的密鑰。
*   **模型黑名單**: 如果不想暴露某些模型（如 `text-embedding-ada-002`），可以在此配置。

添加後，Hermes 會自動在後台啟動同步任務，驗證並拉取可用模型。

### 2. 調用 API
使用任何 OpenAI 兼容的客戶端，將 `baseUrl` 設置為 `http://localhost:3000/v1`，並使用您在 Hermes 中生成的 Key (或暫時使用任意 Bearer Token，視配置而定)。

**示例 (curl):**
```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-hermes-key" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 許可證

MIT License
