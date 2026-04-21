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
import android.os.Parcel
import android.os.Parcelable
import android.os.SystemClock

abstract class DataStats {
    protected var bucketCollections: MutableList<BucketCollection?> = ArrayList()

    abstract fun toBundle(): Bundle

    fun getBucketCollectionSize(): Int = bucketCollections.size

    fun addBucketCollection(index: Int, collection: BucketCollection) {
        while (bucketCollections.size <= index) {
            bucketCollections.add(null)
        }
        bucketCollections[index] = collection
    }

    fun getBucketCollection(index: Int): BucketCollection {
        if (index >= 0 && index < bucketCollections.size) {
            return bucketCollections[index]
                ?: throw IllegalStateException("Bucket collection at index $index is null")
        }
        throw IndexOutOfBoundsException("Index $index out of bounds for bucket collections.")
    }

    fun getNumBuckets(index: Int): Int = getBucketCollection(index).buckets.size

    protected fun now(): Long = SystemClock.elapsedRealtime()

    protected fun addData(data: DataItem) {
        val now = now()
        for (collection in bucketCollections) {
            collection?.addData(data, now)
        }
    }

    interface DataItem : Parcelable {
        fun add(other: DataItem)

        fun reset()

        fun getValue(index: Int): Long

        fun clone(): DataItem
    }

    class BucketCollection : Parcelable {
        val durationMillis: Long
        var currentIndex: Int
        var lastUpdateTime: Long
        private val prototype: DataItem
        val buckets: MutableList<Bucket>

        constructor(size: Int, durationMillis: Long, startTime: Long, prototype: DataItem) {
            this.durationMillis = durationMillis
            this.currentIndex = 0
            this.lastUpdateTime = startTime
            this.prototype = prototype
            this.buckets = MutableList(size) { Bucket(prototype.clone()) }
        }

        private constructor(parcel: Parcel) {
            durationMillis = parcel.readLong()
            currentIndex = parcel.readInt()
            lastUpdateTime = parcel.readLong()
            prototype = requireNotNull(parcel.readParcelable(DataItem::class.java.classLoader))
            buckets = parcel.createTypedArrayList(Bucket.CREATOR)?.toMutableList() ?: mutableListOf()
        }

        override fun writeToParcel(dest: Parcel, flags: Int) {
            dest.writeLong(durationMillis)
            dest.writeInt(currentIndex)
            dest.writeLong(lastUpdateTime)
            dest.writeParcelable(prototype, flags)
            dest.writeTypedList(buckets)
        }

        override fun describeContents(): Int = 0

        fun addData(dataItem: DataItem, now: Long) {
            val elapsed = now - lastUpdateTime
            val numBucketsToShift = (elapsed / durationMillis).toInt()
            lastUpdateTime += durationMillis * numBucketsToShift
            resetBuckets(numBucketsToShift, currentIndex)
            currentIndex = (currentIndex + numBucketsToShift) % buckets.size
            buckets[currentIndex].addData(dataItem)
        }

        private fun resetBuckets(numBuckets: Int, fromIndex: Int) {
            if (numBuckets >= buckets.size) {
                for (bucket in buckets) {
                    bucket.reset()
                }
                return
            }
            for (i in 1..numBuckets) {
                val index = (fromIndex + i) % buckets.size
                buckets[index].reset()
            }
        }

        fun getSeries(dataTypeIndex: Int): List<Long> {
            val now = SystemClock.elapsedRealtime()
            val elapsed = now - lastUpdateTime
            val size = buckets.size
            val numBucketsToSkip = (elapsed / durationMillis).toInt()
            if (numBucketsToSkip >= size) {
                return List(size) { 0L }
            }

            val linearized = MutableList(size) { Bucket(prototype.clone()) }
            val copyFromIndex = (currentIndex + numBucketsToSkip + 1) % size
            for (i in 0 until (size - numBucketsToSkip)) {
                val index = (copyFromIndex + i) % size
                linearized[i] = buckets[index]
            }

            val series = ArrayList<Long>(size)
            for (bucket in linearized) {
                series.add(bucket.getData().getValue(dataTypeIndex))
            }
            return series
        }

        companion object {
            @JvmField
            val CREATOR: Parcelable.Creator<BucketCollection> =
                object : Parcelable.Creator<BucketCollection> {
                    override fun createFromParcel(parcel: Parcel): BucketCollection {
                        return BucketCollection(parcel)
                    }

                    override fun newArray(size: Int): Array<BucketCollection?> {
                        return arrayOfNulls(size)
                    }
                }
        }
    }

    class Bucket : Parcelable {
        private val data: DataItem

        constructor(initialData: DataItem) {
            data = initialData.clone()
        }

        private constructor(parcel: Parcel) {
            data = requireNotNull(parcel.readParcelable(DataItem::class.java.classLoader))
        }

        fun addData(newData: DataItem) {
            data.add(newData)
        }

        fun reset() {
            data.reset()
        }

        fun getData(): DataItem = data

        override fun describeContents(): Int = 0

        override fun writeToParcel(dest: Parcel, flags: Int) {
            dest.writeParcelable(data, flags)
        }

        companion object {
            @JvmField
            val CREATOR: Parcelable.Creator<Bucket> = object : Parcelable.Creator<Bucket> {
                override fun createFromParcel(parcel: Parcel): Bucket {
                    return Bucket(parcel)
                }

                override fun newArray(size: Int): Array<Bucket?> {
                    return arrayOfNulls(size)
                }
            }
        }
    }
}
