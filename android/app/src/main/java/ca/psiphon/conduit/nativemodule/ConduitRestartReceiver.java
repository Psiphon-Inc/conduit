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

package ca.psiphon.conduit.nativemodule;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import ca.psiphon.conduit.nativemodule.logging.MyLog;

public class ConduitRestartReceiver extends BroadcastReceiver {
    String TAG = ConduitRestartReceiver.class.getSimpleName();

    @Override
    public void onReceive(Context context, Intent intent) {
        MyLog.init(context);
        String action = intent.getAction();
        if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(action) ||
                Intent.ACTION_BOOT_COMPLETED.equals(action)
        ) {
            MyLog.i(TAG, "Received " + action + " intent, evaluating Conduit service restart.");

            if (Utils.getServiceRunningFlag(context)) {
                MyLog.i(TAG, "Restarting Conduit service.");
                try {
                    ConduitServiceInteractor.startInProxyWithLastKnownParams(context);
                } catch (Exception e) {
                    MyLog.e(TAG, "Failed to restart Conduit service: " + e.getMessage());
                }
            }
        }
    }
}
