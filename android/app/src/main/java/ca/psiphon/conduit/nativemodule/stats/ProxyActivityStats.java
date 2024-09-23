package ca.psiphon.conduit.nativemodule.stats;

import android.os.Bundle;
import android.os.Parcel;
import android.os.Parcelable;

import java.util.ArrayList;
import java.util.List;

public class ProxyActivityStats extends DataStats implements Parcelable {
  public static final int MAX_BUCKETS = 24 * 60 / 5;
  public static final long BUCKET_PERIOD_MILLISECONDS = 1000;

  private long totalBytesUp = 0;
  private long totalBytesDown = 0;
  private int currentConnectingClients = 0;
  private int currentConnectedClients = 0;
  private long startTime;

  public ProxyActivityStats() {
    super();
    long now = now();

    // Initialize the bucket collection with your data item prototype
    addBucketCollection(0, new BucketCollection(MAX_BUCKETS, BUCKET_PERIOD_MILLISECONDS, now,
      new ProxyActivityDataItem(0, 0, 0, 0)));
  }

  public long getTotalBytesUp() {
    return totalBytesUp;
  }

  public long getTotalBytesDown() {
    return totalBytesDown;
  }

  public int getCurrentConnectingClients() {
    return currentConnectingClients;
  }

  public int getCurrentConnectedClients() {
    return currentConnectedClients;
  }

  public long getElapsedTime() {
    return now() - startTime;
  }

  public List<Long> getBytesUpSeries(int bucketCollectionIndex) {
    return getBucketCollection(bucketCollectionIndex).getSeries(0);
  }

  public List<Long> getBytesDownSeries(int bucketCollectionIndex) {
    return getBucketCollection(bucketCollectionIndex).getSeries(1);
  }

  public List<Long> getConnectingClientsSeries(int bucketCollectionIndex) {
    return getBucketCollection(bucketCollectionIndex).getSeries(2);
  }

  public List<Long> getConnectedClientsSeries(int bucketCollectionIndex) {
    return getBucketCollection(bucketCollectionIndex).getSeries(3);
  }

  protected ProxyActivityStats(Parcel in) {
    startTime = in.readLong();
    totalBytesUp = in.readLong();
    totalBytesDown = in.readLong();
    currentConnectingClients = in.readInt();
    currentConnectedClients = in.readInt();
    int listSize = in.readInt();
    this.bucketCollections = new ArrayList<>(listSize);
    for (int i = 0; i < listSize; i++) {
      BucketCollection collection = in.readParcelable(BucketCollection.class.getClassLoader());
      this.bucketCollections.add(collection);
    }
  }

  @Override
  public void writeToParcel(Parcel dest, int flags) {
    dest.writeLong(startTime);
    dest.writeLong(totalBytesUp);
    dest.writeLong(totalBytesDown);
    dest.writeInt(currentConnectingClients);
    dest.writeInt(currentConnectedClients);
    dest.writeInt(bucketCollections.size());
    for (BucketCollection collection : bucketCollections) {
      dest.writeParcelable(collection, flags);
    }
  }

  public static final Creator<ProxyActivityStats> CREATOR = new Creator<>() {
    @Override
    public ProxyActivityStats createFromParcel(Parcel in) {
      return new ProxyActivityStats(in);
    }

    @Override
    public ProxyActivityStats[] newArray(int size) {
      return new ProxyActivityStats[size];
    }
  };

  @Override
  public int describeContents() {
    return 0;
  }

  public void add(long bytesUp, long bytesDown, int connectingClients, int connectedClients) {
    totalBytesUp += bytesUp;
    totalBytesDown += bytesDown;
    currentConnectingClients = connectingClients;
    currentConnectedClients = connectedClients;
    super.addData(new ProxyActivityDataItem(bytesUp, bytesDown, connectingClients,
      connectedClients));
  }

  @Override
  public Bundle toBundle() {
    Bundle bundle = new Bundle();
    bundle.putParcelable("proxy_activity_stats", this);
    return bundle;
  }

  public static ProxyActivityStats fromBundle(Bundle bundle) {
    bundle.setClassLoader(ProxyActivityStats.class.getClassLoader());
    return bundle.getParcelable("proxy_activity_stats");
  }

  // Inner class to represent the data item
  static class ProxyActivityDataItem implements DataItem {
    private long bytesUp;
    private long bytesDown;
    private int connectingClients;
    private int connectedClients;

    public ProxyActivityDataItem(long bytesUp, long bytesDown, int connectingClients, int connectedClients) {
      this.bytesUp = bytesUp;
      this.bytesDown = bytesDown;
      this.connectingClients = connectingClients;
      this.connectedClients = connectedClients;
    }

    protected ProxyActivityDataItem(Parcel in) {
      bytesUp = in.readLong();
      bytesDown = in.readLong();
      connectingClients = in.readInt();
      connectedClients = in.readInt();
    }

    @Override
    public void writeToParcel(Parcel dest, int flags) {
      dest.writeLong(bytesUp);
      dest.writeLong(bytesDown);
      dest.writeInt(connectingClients);
      dest.writeInt(connectedClients);
    }

    @Override
    public void add(DataItem other) {
      if (!(other instanceof ProxyActivityDataItem)) {
        throw new IllegalArgumentException("Mismatched DataItem type");
      }
      ProxyActivityDataItem o = (ProxyActivityDataItem) other;
      this.bytesUp += o.bytesUp;
      this.bytesDown += o.bytesDown;

      // For the clients counts, take the maximum value
      this.connectingClients = Math.max(this.connectingClients, o.connectingClients);
      this.connectedClients = Math.max(this.connectedClients, o.connectedClients);
    }

    @Override
    public void reset() {
      bytesUp = 0;
      bytesDown = 0;
      connectingClients = 0;
      connectedClients = 0;
    }

    @Override
    public long getValue(int index) {
      return switch (index) {
        case 0 -> bytesUp;
        case 1 -> bytesDown;
        case 2 -> connectingClients;
        case 3 -> connectedClients;
        default -> throw new IllegalArgumentException("Invalid index");
      };
    }

    @Override
    public DataItem clone() {
      return new ProxyActivityDataItem(bytesUp, bytesDown, connectingClients, connectedClients);
    }

    @Override
    public int describeContents() {
      return 0;
    }

    public static final Creator<ProxyActivityDataItem> CREATOR = new Creator<>() {
      @Override
      public ProxyActivityDataItem createFromParcel(Parcel in) {
        return new ProxyActivityDataItem(in);
      }

      @Override
      public ProxyActivityDataItem[] newArray(int size) {
        return new ProxyActivityDataItem[size];
      }
    };
  }
}
