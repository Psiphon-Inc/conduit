package ca.psiphon.conduit.nativemodule.stats;

import android.os.Bundle;
import android.os.Parcel;
import android.os.Parcelable;
import android.os.SystemClock;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public abstract class DataStats {
  protected List<BucketCollection> bucketCollections;

  public DataStats() {
    this.bucketCollections = new ArrayList<>();
  }


  public abstract Bundle toBundle();

  public int getBucketCollectionSize() {
    return bucketCollections.size();
  }

  public void addBucketCollection(int index, BucketCollection collection) {
    // Ensure the list size is enough to add at this index
    while (bucketCollections.size() <= index) {
      bucketCollections.add(null);
    }
    bucketCollections.set(index, collection);
  }

  public BucketCollection getBucketCollection(int index) {
    if (index >= 0 && index < bucketCollections.size()) {
      return bucketCollections.get(index);
    }
    throw new IndexOutOfBoundsException("Index " + index + " out of bounds for bucket collections.");
  }

  public int getNumBuckets(int index) {
    return getBucketCollection(index).buckets.size();
  }

  protected long now() {
    return SystemClock.elapsedRealtime();
  }

  protected void addData(DataItem data) {
    long now = now();
    for (BucketCollection collection : bucketCollections) {
      collection.addData(data, now);
    }
  }

  public interface DataItem extends Parcelable {
    void add(DataItem other);

    void reset();

    long getValue(int index);

    DataItem clone();
  }

  public static class BucketCollection implements Parcelable {

    long durationMillis;
    int currentIndex;
    long lastUpdateTime;
    private final DataItem prototype;
    List<Bucket> buckets;

    public BucketCollection(int size, long durationMillis, long startTime, DataItem prototype) {
      this.durationMillis = durationMillis;
      this.currentIndex = 0;
      this.lastUpdateTime = startTime;
      this.buckets = new ArrayList<>(size);
      this.prototype = prototype;
      // Initialize buckets
      for (int i = 0; i < size; i++) {
        this.buckets.add(new Bucket(prototype.clone()));
      }
    }

    protected BucketCollection(Parcel in) {
      durationMillis = in.readLong();
      currentIndex = in.readInt();
      lastUpdateTime = in.readLong();
      prototype = in.readParcelable(DataItem.class.getClassLoader());
      buckets = in.createTypedArrayList(Bucket.CREATOR);
    }

    @Override
    public void writeToParcel(Parcel dest, int flags) {
      dest.writeLong(durationMillis);
      dest.writeInt(currentIndex);
      dest.writeLong(lastUpdateTime);
      dest.writeParcelable(prototype, flags);
      dest.writeTypedList(buckets);
    }

    @Override
    public int describeContents() {
      return 0;
    }

    public static final Creator<BucketCollection> CREATOR = new Creator<>() {
      @Override
      public BucketCollection createFromParcel(Parcel in) {
        return new BucketCollection(in);
      }

      @Override
      public BucketCollection[] newArray(int size) {
        return new BucketCollection[size];
      }
    };

    public void addData(DataItem dataItem, long now) {
      long elapsed = now - lastUpdateTime;

      // Calculate the number of buckets we need to shift by
      int numBucketsToShift = (int) (elapsed / durationMillis);

      // Update the last update time
      lastUpdateTime += durationMillis * numBucketsToShift;

      // Reset the buckets before shifting
      resetBuckets(numBucketsToShift, currentIndex);

      // Shift the current index
      currentIndex = (currentIndex + numBucketsToShift) % buckets.size();

      // Update the current bucket
      buckets.get(currentIndex).addData(dataItem);
    }

    private void resetBuckets(int numBuckets, int fromIndex) {
      // if the number of buckets is greater than the size of the list, reset all buckets
      if (numBuckets >= buckets.size()) {
        for (Bucket bucket : buckets) {
          bucket.reset();
        }
        return;
      }
      // else reset the buckets that have passed starting with the index following the fromIndex
      for (int i = 1; i <= numBuckets; i++) {
        int index = (fromIndex + i) % buckets.size();
        buckets.get(index).reset();
      }
    }

    public long getDurationMillis() {
      return durationMillis;
    }

    List<Long> getSeries(int dataTypeIndex) {
      long now = SystemClock.elapsedRealtime();
      long elapsed = now - lastUpdateTime;
      int size = buckets.size();

      // Flatten the list of buckets into a linear list before we calculate the series:

      // 1. We are going to skip the buckets that have not been updated since the last update, calculate how many from
      // the current index
      int numBucketsToSkip = (int) (elapsed / durationMillis);

      // 2. If the number of buckets to skip is greater than the size of the bucket list, return a list of zeros
      if (numBucketsToSkip >= size) {
        return Collections.nCopies(size, 0L);
      }

      // 3. Initialize a list of buckets to be linearized with the prototype data
      List<Bucket> linearized = new ArrayList<>(Collections.nCopies(size, new Bucket(prototype.clone())));

      // 4. Calculate the index to start copying from
      int copyFromIndex = (currentIndex + numBucketsToSkip + 1) % size;

      // 5. Copy the buckets that should not be skipped into the linearized list. The skipped buckets should remain
      // empty
      for (int i = 0; i < size - numBucketsToSkip; i++) {
        int index = (copyFromIndex + i) % size;
        linearized.set(i, buckets.get(index));
      }

      // 6. Calculate the series
      ArrayList<Long> series = new ArrayList<>();
      for (Bucket bucket : linearized) {
        series.add(bucket.getData().getValue(dataTypeIndex));
      }
      return series;
    }
  }

  public static class Bucket implements Parcelable {
    private final DataItem data;


    public Bucket(DataItem initialData) {
      this.data = initialData.clone();
    }

    public void addData(DataItem newData) {
      this.data.add(newData);
    }

    public void reset() {
      this.data.reset();
    }

    public DataItem getData() {
      return data;
    }

    protected Bucket(Parcel in) {
      data = in.readParcelable(DataItem.class.getClassLoader());
    }

    @Override
    public int describeContents() {
      return 0;
    }

    @Override
    public void writeToParcel(Parcel dest, int flags) {
      dest.writeParcelable(data, flags);
    }

    public static final Creator<Bucket> CREATOR = new Creator<>() {
      @Override
      public Bucket createFromParcel(Parcel in) {
        return new Bucket(in);
      }

      @Override
      public Bucket[] newArray(int size) {
        return new Bucket[size];
      }
    };
  }
}
