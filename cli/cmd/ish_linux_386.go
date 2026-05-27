//go:build linux && 386

package cmd

import "runtime"

func init() {
	// iSH's %gs TLS emulation is unreliable in signal handler context. With
	// multiple Ps, Go sends SIGURG to preempt goroutines across OS threads,
	// which triggers a "bad g in signal handler" crash. GOMAXPROCS=1 keeps
	// all goroutines on a single P, preventing cross-thread SIGURG delivery.
	runtime.GOMAXPROCS(1)
}
