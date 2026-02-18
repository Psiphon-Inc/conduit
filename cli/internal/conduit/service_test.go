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

package conduit

import (
	"testing"
	"time"

	"github.com/Psiphon-Inc/conduit/cli/internal/config"
)

func TestHandleNoticeInproxyProxyActivityAccumulatesRegionDeltas(t *testing.T) {
	s := &Service{
		config:               &config.Config{},
		stats:                &Stats{StartTime: time.Now()},
		regionActivityTotals: make(map[string]map[string]RegionActivityTotals),
	}

	notice1 := []byte(`{"noticeType":"InproxyProxyActivity","data":{"announcing":1,"connectingClients":2,"connectedClients":5,"bytesUp":12345,"bytesDown":67890,"personalRegionActivity":{"US":{"bytesUp":111,"bytesDown":222,"connectingClients":1,"connectedClients":2},"CA":{"bytesUp":0,"bytesDown":64,"connectingClients":0,"connectedClients":1}},"commonRegionActivity":{"BR":{"bytesUp":333,"bytesDown":444,"connectingClients":0,"connectedClients":3}}},"timestamp":"2026-02-10T12:34:56.789Z"}`)
	notice2 := []byte(`{"noticeType":"InproxyProxyActivity","data":{"announcing":0,"connectingClients":1,"connectedClients":6,"bytesUp":55,"bytesDown":66,"personalRegionActivity":{"US":{"bytesUp":10,"bytesDown":20,"connectingClients":0,"connectedClients":1}},"commonRegionActivity":{"BR":{"bytesUp":7,"bytesDown":8,"connectingClients":1,"connectedClients":0},"DE":{"bytesUp":1,"bytesDown":2,"connectingClients":0,"connectedClients":1}}},"timestamp":"2026-02-10T12:35:56.789Z"}`)

	s.handleNotice(notice1)
	s.handleNotice(notice2)

	stats := s.GetStats()
	if stats.TotalBytesUp != 12400 {
		t.Fatalf("unexpected total bytes up: got %d", stats.TotalBytesUp)
	}
	if stats.TotalBytesDown != 67956 {
		t.Fatalf("unexpected total bytes down: got %d", stats.TotalBytesDown)
	}
	if stats.Announcing != 0 || stats.ConnectingClients != 1 || stats.ConnectedClients != 6 {
		t.Fatalf("unexpected client state: announcing=%d connecting=%d connected=%d", stats.Announcing, stats.ConnectingClients, stats.ConnectedClients)
	}
	if !stats.IsLive {
		t.Fatalf("expected IsLive to be true")
	}

	personalUS := s.regionActivityTotals[regionScopePersonal]["US"]
	if personalUS.BytesUp != 121 || personalUS.BytesDown != 242 || personalUS.ConnectingClients != 0 || personalUS.ConnectedClients != 1 {
		t.Fatalf("unexpected personal US totals: %+v", personalUS)
	}

	personalCA := s.regionActivityTotals[regionScopePersonal]["CA"]
	if personalCA.BytesUp != 0 || personalCA.BytesDown != 64 || personalCA.ConnectingClients != 0 || personalCA.ConnectedClients != 0 {
		t.Fatalf("unexpected personal CA totals: %+v", personalCA)
	}

	commonBR := s.regionActivityTotals[regionScopeCommon]["BR"]
	if commonBR.BytesUp != 340 || commonBR.BytesDown != 452 || commonBR.ConnectingClients != 1 || commonBR.ConnectedClients != 0 {
		t.Fatalf("unexpected common BR totals: %+v", commonBR)
	}

	commonDE := s.regionActivityTotals[regionScopeCommon]["DE"]
	if commonDE.BytesUp != 1 || commonDE.BytesDown != 2 || commonDE.ConnectingClients != 0 || commonDE.ConnectedClients != 1 {
		t.Fatalf("unexpected common DE totals: %+v", commonDE)
	}
}

func TestHandleNoticeInproxyProxyActivityWithoutRegionMaps(t *testing.T) {
	s := &Service{
		config:               &config.Config{},
		stats:                &Stats{StartTime: time.Now()},
		regionActivityTotals: make(map[string]map[string]RegionActivityTotals),
	}

	notice := []byte(`{"noticeType":"InproxyProxyActivity","data":{"announcing":1,"connectingClients":0,"connectedClients":0,"bytesUp":10,"bytesDown":20},"timestamp":"2026-02-10T12:34:56.789Z"}`)
	s.handleNotice(notice)

	if len(s.regionActivityTotals) != 0 {
		t.Fatalf("expected no region totals, got: %+v", s.regionActivityTotals)
	}

	stats := s.GetStats()
	if stats.TotalBytesUp != 10 || stats.TotalBytesDown != 20 {
		t.Fatalf("unexpected totals: up=%d down=%d", stats.TotalBytesUp, stats.TotalBytesDown)
	}
}
