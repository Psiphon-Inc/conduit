package metrics

import (
	"errors"

	"github.com/prometheus/client_golang/prometheus"
)

// build and register a new Prometheus gauge by accepting its options.
func newGauge(gaugeOpts prometheus.GaugeOpts) prometheus.Gauge {
	ev := prometheus.NewGauge(gaugeOpts)

	err := prometheus.Register(ev)
	if err != nil {
		var are prometheus.AlreadyRegisteredError
		if ok := errors.As(err, &are); ok {
			ev, ok = are.ExistingCollector.(prometheus.Gauge)
			if !ok {
				panic("different metric type registration")
			}
		} else {
			panic(err)
		}
	}

	return ev
}

// build and register a new Prometheus gauge vector by accepting its options and labels.
func newGaugeVec(gaugeOpts prometheus.GaugeOpts, labels []string) *prometheus.GaugeVec {
	ev := prometheus.NewGaugeVec(gaugeOpts, labels)

	err := prometheus.Register(ev)
	if err != nil {
		var are prometheus.AlreadyRegisteredError
		if ok := errors.As(err, &are); ok {
			ev, ok = are.ExistingCollector.(*prometheus.GaugeVec)
			if !ok {
				panic("different metric type registration")
			}
		} else {
			panic(err)
		}
	}

	return ev
}

// build and register a new Prometheus gauge function by accepting its options and function.
func newGaugeFunc(gaugeOpts prometheus.GaugeOpts, function func() float64) prometheus.GaugeFunc {
	ev := prometheus.NewGaugeFunc(gaugeOpts, function)

	err := prometheus.Register(ev)
	if err != nil {
		var are prometheus.AlreadyRegisteredError
		if ok := errors.As(err, &are); ok {
			ev, ok = are.ExistingCollector.(prometheus.GaugeFunc)
			if !ok {
				panic("different metric type registration")
			}
		} else {
			panic(err)
		}
	}

	return ev
}

// registers or reuses a collector without crashing.
func registerCollector(ct prometheus.Collector) {
	if err := prometheus.Register(ct); err != nil {
		var are prometheus.AlreadyRegisteredError
		if errors.As(err, &are) {
			return
		}
		panic(err)
	}
}
