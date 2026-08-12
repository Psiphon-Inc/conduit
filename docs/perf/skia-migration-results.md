# Skia migration performance results

Captured on 2026-08-11 on a Pixel 7 running Android 16 (SDK 36), with manual
brightness 128, battery saver off, animation scales 1.0, thermal status 0,
embedded release bundles, deterministic mock data, and three-run medians.

The strict comparison used the same seven-light workload on both builds. Lower
is better. A negative change is an improvement.

| Category     | Metric                 |              Skia before |  Native after | Change |
| ------------ | ---------------------- | -----------------------: | ------------: | -----: |
| Frame time   | p50                    |                     9 ms |         10 ms | +11.1% |
| Frame time   | p90                    |                    10 ms |         12 ms | +20.0% |
| Frame time   | p95                    |                    11 ms |         12 ms |  +9.1% |
| Frame time   | p99                    |                    18 ms |         14 ms | -22.2% |
| Jank         | Janky frames           |                    0.76% |         0.11% | -85.5% |
| Jank         | >20 ms / 1000 frames   |                    4.506 |         0.558 | -87.6% |
| Jank         | >33 ms frames          |                        2 |             0 |  -100% |
| Scheduling   | Missed vsync           |                        1 |             0 |  -100% |
| Scheduling   | Frame deadlines missed |                       39 |             6 | -84.6% |
| Memory       | Total PSS              |               358,234 KB |    280,302 KB | -21.8% |
| Memory       | Total RSS              |               474,944 KB |    394,812 KB | -16.9% |
| Memory       | Graphics PSS           |               174,964 KB |     85,052 KB | -51.4% |
| Android size | Universal signed APK   |            235,981,077 B | 195,152,092 B | -17.3% |
| Web size     | Production `dist/`     |                    15 MB |        6.5 MB | -56.7% |
| Web size     | Entry JS, raw          |                   5.1 MB |        4.5 MB | -11.8% |
| Web size     | Entry JS, gzip         |                   1.3 MB |        1.2 MB |  -7.7% |
| Web size     | CanvasKit Wasm         | 8.1 MB raw / 3.1 MB gzip |       removed |  -100% |

The result is not a uniform frame-time reduction: p50 through p95 became 1-2
ms slower, while the user-visible tail improved substantially. The strongest
native wins are p99, slow-frame incidence, deadline misses, graphics memory,
and packaged size.

## Higher-load native check

The post-optimization native stress fixture uses three orbs, two active lanes,
and 19 moving lights. Its three-run medians were p50/p90/p95/p99 of
12/13/14/18 ms, 0.56% jank, 4.26 frames over 20 ms per 1000, zero median frames
over 33 ms, and 21 frame-deadline misses.

That busier native scene still slightly beats the lighter seven-light Skia
baseline on jank (0.56% vs 0.76%) and >20 ms incidence (4.26 vs 4.506 per
1000), while matching its 18 ms p99. This is useful capacity evidence, but it
is not the strict migration comparison because the workloads differ.

Web measurements used the same macOS machine, Chromium version, viewport, and
five-second animation windows. CanvasKit's approximately 145 ms first-paint
gate was also removed; the multi-light worst frame improved from 100 ms to
17.7 ms and its >20 ms count fell to zero in the sampled windows.
