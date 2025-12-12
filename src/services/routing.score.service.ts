type Stat = {
  successEwma: number; // 0..1
  latencyEwma: number; // ms
  samples: number;
  lastUpdated: number;
};

// 簡單的滑動權重：結合成功率和延遲，為 provider+model 動態打分
export class RoutingScoreService {
  private static readonly ALPHA = 0.2; // EWMA 平滑係數
  private static readonly DEFAULT_SUCCESS = 0.7;
  private static readonly DEFAULT_LATENCY = 1000;
  private static stats = new Map<string, Stat>(); // key: providerId:model

  private static key(providerId: string, model: string) {
    return `${providerId}:${model}`;
  }

  static resetForTest() {
    this.stats.clear();
  }

  static update(providerId: string, model: string, success: boolean, latencyMs?: number) {
    const key = this.key(providerId, model);
    const now = Date.now();
    const prev = this.stats.get(key) ?? {
      successEwma: this.DEFAULT_SUCCESS,
      latencyEwma: this.DEFAULT_LATENCY,
      samples: 0,
      lastUpdated: now,
    };

    const alpha = this.ALPHA;
    const succVal = success ? 1 : 0;
    const latency = latencyMs ?? prev.latencyEwma;

    const next: Stat = {
      successEwma: (1 - alpha) * prev.successEwma + alpha * succVal,
      latencyEwma: (1 - alpha) * prev.latencyEwma + alpha * latency,
      samples: prev.samples + 1,
      lastUpdated: now,
    };

    this.stats.set(key, next);
  }

  static scoreFor(providerId: string, model: string): number {
    const key = this.key(providerId, model);
    const stat = this.stats.get(key) ?? {
      successEwma: this.DEFAULT_SUCCESS,
      latencyEwma: this.DEFAULT_LATENCY,
      samples: 0,
      lastUpdated: Date.now(),
    };

    const successScore = stat.successEwma; // 0..1
    const latencyScore = 1 / (1 + stat.latencyEwma / 800); // 越低延遲得分越高，約 0~1

    // 70% 成功率，30% 延遲，並加少量抖動避免極端平局
    const jitter = Math.random() * 0.01;
    return successScore * 0.7 + latencyScore * 0.3 + jitter;
  }
}
