//go:build windows

/*
 * Copyright (c) 2024, Psiphon Inc.
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

package service

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/svc"
)

// ConduitService implements the Windows service interface.
type ConduitService struct {
	runFunc func(ctx context.Context) error
}

// Execute is called by Windows when the service is started.
func (s *ConduitService) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (bool, uint32) {
	const cmdsAccepted = svc.AcceptStop | svc.AcceptShutdown

	changes <- svc.Status{State: svc.StartPending}

	// Create cancellable context
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start the actual service in a goroutine
	errChan := make(chan error, 1)
	go func() {
		errChan <- s.runFunc(ctx)
	}()

	changes <- svc.Status{State: svc.Running, Accepts: cmdsAccepted}

	// Wait for stop signal or error
	for {
		select {
		case err := <-errChan:
			if err != nil {
				// Log error (service is ending)
				writeToLog(fmt.Sprintf("Service error: %v", err))
				return false, 1
			}
			return false, 0

		case c := <-r:
			switch c.Cmd {
			case svc.Interrogate:
				changes <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				changes <- svc.Status{State: svc.StopPending}
				cancel()
				// Wait for service to stop
				<-errChan
				return false, 0
			default:
				writeToLog(fmt.Sprintf("Unexpected control request: %d", c.Cmd))
			}
		}
	}
}

// RunAsWindowsService runs the provided function as a Windows service.
func RunAsWindowsService(runFunc func(ctx context.Context) error) error {
	// Check if running as a Windows service
	isService, err := svc.IsWindowsService()
	if err != nil {
		return fmt.Errorf("failed to check if running as service: %w", err)
	}

	if !isService {
		return fmt.Errorf("not running as a Windows service")
	}

	return svc.Run(ServiceName, &ConduitService{runFunc: runFunc})
}

// IsWindowsService returns true if running as a Windows service.
func IsWindowsService() bool {
	isService, _ := svc.IsWindowsService()
	return isService
}

func writeToLog(msg string) {
	programData := os.Getenv("ProgramData")
	if programData == "" {
		programData = `C:\ProgramData`
	}
	logPath := filepath.Join(programData, "Conduit", "conduit.log")

	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintln(f, msg)
}
