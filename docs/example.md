# Example Documentation

This is a sample document to test the docs-mcp-server indexing pipeline.

## Architecture Overview

The system uses a hybrid search approach combining semantic vector search with traditional keyword matching. This ensures both conceptual similarity and exact identifier matching work well.

### Networking Layer

The networking layer handles all client-server communication using a custom UDP-based protocol optimized for real-time game state replication.

#### Replication

Replication is handled via `UAbilitySystemComponent` which manages the synchronization of gameplay abilities across the network. The system supports both reliable and unreliable replication channels.

Key ticket: ISM-247 tracks the ongoing work to optimize replication bandwidth.

## Configuration Guide

To configure the system, modify the following settings:

1. `MaxReplicationRate` - Controls the maximum rate of property replication
2. `NetUpdateFrequency` - How often actors replicate to clients
3. `MinNetUpdateFrequency` - Minimum replication frequency under low bandwidth

## Troubleshooting

### Common Issues

- **High Latency**: Check `NetUpdateFrequency` settings and ensure the server tick rate is sufficient
- **Desync**: Verify that all replicated properties are marked with `UPROPERTY(Replicated)`
- **Bandwidth Spikes**: Use the network profiler to identify which actors are sending excessive data
