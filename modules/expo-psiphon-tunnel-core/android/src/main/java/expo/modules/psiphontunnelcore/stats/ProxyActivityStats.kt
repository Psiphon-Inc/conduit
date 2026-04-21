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
 */

package expo.modules.psiphontunnelcore.stats

import android.os.Bundle
import android.os.Build
import android.os.Parcel
import android.os.Parcelable

class ProxyActivityStats private constructor(initializeCollections: Boolean) : DataStats(), Parcelable {
    var totalBytesUp = 0L
        private set
    var totalBytesDown = 0L
        private set
    var currentAnnouncingWorkers = 0
        private set
    var currentConnectingClients = 0
        private set
    var currentConnectedClients = 0
        private set
    private var startTime = 0L

    val elapsedTime: Long
        get() = now() - startTime

    constructor() : this(true)

    init {
        if (initializeCollections) {
            val now = now()
            startTime = now

            addBucketCollection(
                BUCKET_COLLECTION_1000MS,
                BucketCollection(
                    MAX_BUCKETS_1000MS,
                    BUCKET_PERIOD_MILLISECONDS_1000MS,
                    now,
                    ProxyActivityDataItem(0, 0, 0, 0, 0),
                ),
            )
            addBucketCollection(
                BUCKET_COLLECTION_3600000MS,
                BucketCollection(
                    MAX_BUCKETS_3600000MS,
                    BUCKET_PERIOD_MILLISECONDS_3600000MS,
                    now,
                    ProxyActivityDataItem(0, 0, 0, 0, 0),
                ),
            )
        }
    }

    private constructor(parcel: Parcel) : this(false) {
        startTime = parcel.readLong()
        totalBytesUp = parcel.readLong()
        totalBytesDown = parcel.readLong()
        currentAnnouncingWorkers = parcel.readInt()
        currentConnectingClients = parcel.readInt()
        currentConnectedClients = parcel.readInt()
        val listSize = parcel.readInt()
        bucketCollections = ArrayList(listSize)
        repeat(listSize) {
            val bucketCollection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                parcel.readParcelable(
                    BucketCollection::class.java.classLoader,
                    BucketCollection::class.java,
                )
            } else {
                @Suppress("DEPRECATION")
                parcel.readParcelable(BucketCollection::class.java.classLoader)
            }
            bucketCollections.add(bucketCollection)
        }
    }

    fun getBytesUpSeries(bucketCollectionIndex: Int): List<Long> {
        return getBucketCollection(bucketCollectionIndex).getSeries(0)
    }

    fun getBytesDownSeries(bucketCollectionIndex: Int): List<Long> {
        return getBucketCollection(bucketCollectionIndex).getSeries(1)
    }

    fun getAnnouncingWorkersSeries(bucketCollectionIndex: Int): List<Long> {
        return getBucketCollection(bucketCollectionIndex).getSeries(2)
    }

    fun getConnectingClientsSeries(bucketCollectionIndex: Int): List<Long> {
        return getBucketCollection(bucketCollectionIndex).getSeries(3)
    }

    fun getConnectedClientsSeries(bucketCollectionIndex: Int): List<Long> {
        return getBucketCollection(bucketCollectionIndex).getSeries(4)
    }

    override fun writeToParcel(dest: Parcel, flags: Int) {
        dest.writeLong(startTime)
        dest.writeLong(totalBytesUp)
        dest.writeLong(totalBytesDown)
        dest.writeInt(currentAnnouncingWorkers)
        dest.writeInt(currentConnectingClients)
        dest.writeInt(currentConnectedClients)
        dest.writeInt(bucketCollections.size)
        for (collection in bucketCollections) {
            dest.writeParcelable(collection, flags)
        }
    }

    override fun describeContents(): Int = 0

    fun add(
        bytesUp: Long,
        bytesDown: Long,
        announcingWorkers: Int,
        connectingClients: Int,
        connectedClients: Int,
    ) {
        totalBytesUp += bytesUp
        totalBytesDown += bytesDown
        currentAnnouncingWorkers = announcingWorkers
        currentConnectingClients = connectingClients
        currentConnectedClients = connectedClients
        addData(
            ProxyActivityDataItem(
                bytesUp,
                bytesDown,
                announcingWorkers,
                connectingClients,
                connectedClients,
            ),
        )
    }

    override fun toBundle(): Bundle {
        return Bundle().apply {
            putParcelable("proxy_activity_stats", this@ProxyActivityStats)
        }
    }

    private class ProxyActivityDataItem(
        private var bytesUp: Long,
        private var bytesDown: Long,
        private var announcingWorkers: Int,
        private var connectingClients: Int,
        private var connectedClients: Int,
    ) : DataItem {
        private constructor(parcel: Parcel) : this(
            parcel.readLong(),
            parcel.readLong(),
            parcel.readInt(),
            parcel.readInt(),
            parcel.readInt(),
        )

        override fun writeToParcel(dest: Parcel, flags: Int) {
            dest.writeLong(bytesUp)
            dest.writeLong(bytesDown)
            dest.writeInt(announcingWorkers)
            dest.writeInt(connectingClients)
            dest.writeInt(connectedClients)
        }

        override fun add(other: DataItem) {
            if (other !is ProxyActivityDataItem) {
                throw IllegalArgumentException("Mismatched DataItem type")
            }
            bytesUp += other.bytesUp
            bytesDown += other.bytesDown
            announcingWorkers = maxOf(announcingWorkers, other.announcingWorkers)
            connectingClients = maxOf(connectingClients, other.connectingClients)
            connectedClients = maxOf(connectedClients, other.connectedClients)
        }

        override fun reset() {
            bytesUp = 0
            bytesDown = 0
            announcingWorkers = 0
            connectingClients = 0
            connectedClients = 0
        }

        override fun getValue(index: Int): Long {
            return when (index) {
                0 -> bytesUp
                1 -> bytesDown
                2 -> announcingWorkers.toLong()
                3 -> connectingClients.toLong()
                4 -> connectedClients.toLong()
                else -> throw IllegalArgumentException("Invalid index")
            }
        }

        override fun clone(): DataItem {
            return ProxyActivityDataItem(
                bytesUp,
                bytesDown,
                announcingWorkers,
                connectingClients,
                connectedClients,
            )
        }

        override fun describeContents(): Int = 0

        companion object {
            @JvmField
            val CREATOR: Parcelable.Creator<ProxyActivityDataItem> =
                object : Parcelable.Creator<ProxyActivityDataItem> {
                    override fun createFromParcel(parcel: Parcel): ProxyActivityDataItem {
                        return ProxyActivityDataItem(parcel)
                    }

                    override fun newArray(size: Int): Array<ProxyActivityDataItem?> {
                        return arrayOfNulls(size)
                    }
                }
        }
    }

    companion object {
        const val BUCKET_COLLECTION_1000MS = 0
        const val BUCKET_COLLECTION_3600000MS = 1
        const val MAX_BUCKETS_1000MS = 24 * 60 / 5
        const val BUCKET_PERIOD_MILLISECONDS_1000MS = 1000L
        const val MAX_BUCKETS_3600000MS = 24 * 30
        const val BUCKET_PERIOD_MILLISECONDS_3600000MS = 3600000L

        // Backwards compatible aliases for existing callers.
        const val MAX_BUCKETS = MAX_BUCKETS_1000MS
        const val BUCKET_PERIOD_MILLISECONDS = BUCKET_PERIOD_MILLISECONDS_1000MS

        fun fromBundle(bundle: Bundle): ProxyActivityStats? {
            bundle.classLoader = ProxyActivityStats::class.java.classLoader
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                bundle.getParcelable("proxy_activity_stats", ProxyActivityStats::class.java)
            } else {
                @Suppress("DEPRECATION")
                bundle.getParcelable("proxy_activity_stats")
            }
        }

        @JvmField
        val CREATOR: Parcelable.Creator<ProxyActivityStats> =
            object : Parcelable.Creator<ProxyActivityStats> {
                override fun createFromParcel(parcel: Parcel): ProxyActivityStats {
                    return ProxyActivityStats(parcel)
                }

                override fun newArray(size: Int): Array<ProxyActivityStats?> {
                    return arrayOfNulls(size)
                }
            }
    }
}
