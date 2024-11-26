# Linda Protocol

Linda Protocol is a decentralized messaging and social protocol built on GunDB and Ethereum, providing secure and private communications with blockchain-based integrity verification.

## Overview

Linda Protocol combines decentralized storage (GunDB), blockchain security (Ethereum), and end-to-end encryption to create a secure and private communication platform. It includes an internal wallet system for payments and stealth transactions, enabling a complete decentralized social experience.

## Project Structure

The project is organized as a monorepo using npm workspaces with the following packages:

### `/packages/client`
- React-based web application
- User interface components
- State management with Redux
- WebRTC integration for P2P
- Wallet connection logic

### `/packages/relay` 
- Node.js relay server
- Message routing and caching
- Network optimization
- Metrics collection
- DDoS protection

### `/packages/protocol`
- Core protocol implementation
- Encryption and security
- Smart contracts
- GunDB integration
- IPFS storage

### `/packages/common`
- Shared types and interfaces
- Utility functions
- Constants
- Test helpers

## Key Features

### Decentralized Architecture
- GunDB for distributed data storage and real-time sync
- Ethereum smart contracts for identity verification and payments
- IPFS integration for decentralized file storage
- High-performance relay servers for optimal message delivery
- Full support for Optimism Sepolia network
- Peer-to-peer message routing
- Distributed state management

### Security & Privacy
- Military-grade end-to-end encryption for all private messages
- Certificate-based access control system
- Message integrity verification through blockchain
- Stealth payment capabilities using zero-knowledge proofs
- Session-based authentication with key rotation
- Multi-factor authentication support
- Forward secrecy for messages
- Encrypted metadata
- Anti-spam protection

### Communication Features
- Encrypted private messaging with perfect forward secrecy
- Public and private channels with customizable permissions
- Threaded discussion boards with moderation tools
- Certificate-based friend system with trust levels
- Real-time updates and presence detection
- Message status tracking and delivery confirmation
- Offline message support with sync
- Rich media sharing
- Voice and video call capabilities
- Group chat with advanced permissions

### Wallet System
- Built-in wallet generation with recovery options
- Seamless MetaMask integration
- Stealth payments using ring signatures
- Tipping system with multiple currencies
- Detailed transaction tracking and history
- Multi-wallet support with hardware wallet integration
- Gas fee optimization
- Cross-chain compatibility
- Smart contract interaction

## Protocol Modules

### Core Protocol (`/protocol`)
The Linda protocol is organized into specialized modules that handle different functionalities:

#### Authentication (`/authentication`)
- Multi-provider authentication system
- Support for MetaMask and cryptographic keys
- Session management with key rotation
- Account recovery system
- Blockchain-based identity verification

#### Messaging (`/messaging`)
- End-to-end encrypted private chats
- Public and private channels
- Threading system for discussions
- Read receipts and message status
- Multimedia content support
- Real-time user presence management

#### Friends System (`/friends`)
- Friend request management
- Certificate system for authorizations
- Configurable trust levels
- Contact blocking and unblocking
- Friendship status synchronization

#### Security (`/security`)
- End-to-end encryption for private messages
- Certificate system for authorizations
- Key management and rotation
- Message integrity verification
- Metadata protection

#### Storage (`/storage`)
- Distributed data management with GunDB
- IPFS integration for files
- Local cache with LRU
- State synchronization
- Automatic backup

#### Network (`/network`)
- P2P network topology management
- Node and relay discovery
- Load balancing
- Connection monitoring
- Routing optimization

#### Wallet (`/wallet`)
- Ethereum wallet integration
- Stealth payments
- Tipping system
- Transaction management
- Multi-wallet support

### Relay Server (`/relay`)
The relay server provides:
- Network performance optimization
- Traffic load balancing
- Message caching
- Metrics monitoring
- DDoS protection
- Node discovery
- Connection management

### Technical Architecture
- Distributed database with GunDB
- Ethereum smart contracts for verification
- Decentralized IPFS storage
- End-to-end encryption
- X509 certificate system
- LRU cache for performance
- WebRTC for P2P communication

## Installation

### Prerequisites
- Node.js >= 14
- npm or yarn
- MetaMask wallet
- Optimism Sepolia testnet access
- At least 2GB RAM
- Stable internet connection

### Quick Start

1. Clone the repository:
