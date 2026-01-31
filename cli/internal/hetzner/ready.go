/*
 * Copyright (c) 2026, Psiphon Inc.
 * All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

package hetzner

import (
	"context"
	"net/http"
	"time"
)

const (
	conduitReadyPollInterval = 10 * time.Second
	conduitReadyTimeout      = 15 * time.Minute
)

// waitForConduitReady polls the Conduit metrics endpoint on the server until it responds
// or the context/timeout is exceeded. Progress is reported via report every poll.
func waitForConduitReady(ctx context.Context, ip string, report ProgressReport, progress func(ProgressReport)) error {
	url := "http://" + ip + ":9090/metrics"
	deadline := time.Now().Add(conduitReadyTimeout)
	client := &http.Client{Timeout: 5 * time.Second}
	start := time.Now()
	var lastReport time.Time

	for {
		if time.Now().After(deadline) {
			return context.DeadlineExceeded
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			elapsed := time.Since(start)
			report.Elapsed = elapsed
			report.Timeout = conduitReadyTimeout
			if progress != nil && time.Since(lastReport) >= conduitReadyPollInterval {
				progress(report)
				lastReport = time.Now()
			}
			time.Sleep(conduitReadyPollInterval)
			continue
		}
		resp, err := client.Do(req)
		if err != nil {
			elapsed := time.Since(start)
			report.Elapsed = elapsed
			report.Timeout = conduitReadyTimeout
			if progress != nil && time.Since(lastReport) >= conduitReadyPollInterval {
				progress(report)
				lastReport = time.Now()
			}
			time.Sleep(conduitReadyPollInterval)
			continue
		}
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			return nil
		}
		elapsed := time.Since(start)
		report.Elapsed = elapsed
		report.Timeout = conduitReadyTimeout
		if progress != nil && time.Since(lastReport) >= conduitReadyPollInterval {
			progress(report)
			lastReport = time.Now()
		}
		time.Sleep(conduitReadyPollInterval)
	}
}
