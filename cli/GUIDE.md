# Conduit Station Deployment Guide

*This guide will change as networks change.* We will endeavour to keep it up to date.

A Conduit station is a proxy that sits between Psiphon users and the Psiphon network. During the Psiphon connection sequence, Psiphon launches many connection candidates in parallel in the "connection horserace". Some of these connection candidates will be to Conduit stations. If your Conduit station wins the horserace for a user, then you connect that user to the Psiphon Network through an encrypted tunnel. Through this encrypted tunnel, Psiphon users can access the open internet.

The encrypted tunnels you are proxying are opaque to your Conduit station; your Conduit station cannot see into these tunnels. None the less, please minimize the amount of logging you are doing. We will endeavour to make statistics about the tunnels you are supporting available to you through the official CLI's prometheus `/metrics` endpoint, please open issues requesting the information you would like to be able to scrape if we are not already [exporting it](./internal/metrics/metrics.go).

Our backend connection brokers have a reputation system that is used to make sure only performant Conduit stations receive high connection volumes. For this reason, it is important to run performant Conduit stations to have the most impact.

## Guidance for Conduit station infrastructure:

- Spread your Conduits out across data centers/locations, IP diversity is very important.
- Don't overload your Conduit. Watch resource utilization, and reduce the --max-common-clients if you are seeing any signs of resource contention.
- Keep your station online consistently so that it has a strong reputation with the tunnel connection broker.

We have observed that Conduit can support around 150-350 concurrent users for every 1 CPU and 2GB RAM. Factors like the CPU clock speed and network speed will determine where in this range your Conduit will perform best. 

## Expected usage patterns:

Conduit is one tool of many in Psiphon's toolbox. On some networks, Conduit will not work as well as some of our other protocols, and on other networks Conduit may be the best way to get users connected. This changes constantly as network conditions change. Like everything, Conduit servers can be blocked, this is another reason why IP diversity is so important.

Brand new Conduit stations will take time to build up a reputation with the tunnel connection broker. For this reason, it is not unexpected for freshly deployed Conduit stations to not see traffic for some hours or even days, depending on supply vs demand. If you can, keep your Conduit stations running even if they are not seeing high connection volumes; this latent capacity may become very useful when network conditions change.

Thank you for your interest and participation in this project and for helping to build the free and open internet.
