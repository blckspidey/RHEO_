<!-- PAGE 1 -->

MASTER BUILD PROMPT — V1 REAL-TIME MULTI-
USER FILE TRANSFER SYSTEM
You are a senior full-stack engineer , backend engineer , networking engineer , and DevOps engineer .
Build a complete V1 Real-Time Multi-User File Transfer System from scratch.
The goal is to create a serious, resume-worthy networking/full-stack project that demonstrates practical
understanding of:
WebSockets
Socket.IO
TCP
HTTP/WebSocket upgrade
Persistent connections
Real-time communication
File streaming
Chunked file transfer
Application-level acknowledgements
Pause/resume
Connection recovery
Concurrent transfers
One-sender-to-multiple-receivers
SHA-256 integrity verification
PostgreSQL
Redis Pub/Sub
Horizontal scaling
AWS EC2
AWS Application Load Balancer
AWS Auto Scaling Groups
Docker
Nginx
HTTPS/WSS
IMPORTANT:
This is V1.
Do NOT introduce WebRTC, STUN, TURN, Kubernetes, microservices, or other unnecessary technologies.
The architecture should be clean enough that WebRTC can be introduced as a future V2 without requiring a
complete rewrite.
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
1

<!-- PAGE 2 -->

1. PROJECT CONCEPT
Build a web application similar in concept to a simplified combination of:
AirDrop
LocalSend
WeTransfer
real-time collaboration systems
but focused specifically on demonstrating networking concepts.
A registered user should be able to:
Create an account.
Log in.
Search for another registered user .
See whether that user is online/offline.
Select one or multiple recipients.
Select a large file.
Send the file through a persistent WebSocket connection.
Transfer the file in manageable chunks.
See real-time transfer progress.
Pause the transfer .
Resume the transfer .
Handle WebSocket disconnections.
Reconnect automatically.
Resume from the last successfully confirmed application-level chunk.
Verify the completed file using SHA-256.
Transfer one file to multiple recipients simultaneously.
Handle multiple independent transfers simultaneously.
See transfer history.
See transfer status and errors through a clean UI.
The backend will initially act as a relay:
Sender
   ↓
WebSocket / Socket.IO
   ↓
Node.js server
   ↓
WebSocket / Socket.IO
   ↓
Receiver
The actual transport underneath WebSocket is TCP .
• 
• 
• 
• 
1. 
2. 
3. 
4. 
5. 
6. 
7. 
8. 
9. 
10. 
11. 
12. 
13. 
14. 
15. 
16. 
17. 
18. 
19. 
2

<!-- PAGE 3 -->

Do NOT use WebRTC in V1.
2. IMPORTANT NETWORKING DISTINCTION
The implementation and documentation must clearly understand the following:
Application
     ↓
File Transfer Protocol
     ↓
WebSocket / Socket.IO
     ↓
TCP
     ↓
IP
     ↓
Wi-Fi / Ethernet
WebSocket is an application-layer protocol.
WebSocket runs over TCP .
TCP is responsible for:
reliable byte-stream delivery
ordering
retransmission of lost TCP data
flow control
congestion control
connection management
The application must NOT attempt to retransmit individual TCP/IP packets.
Instead, the application should implement:
chunk identification
application-level acknowledgements
transfer state
resume after connection failure
This distinction must be reflected in the code comments and project documentation.
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
3

<!-- PAGE 4 -->

3. TECHNOLOGY STACK
Use JavaScript throughout the project.
DO NOT use TypeScript.
Frontend
Use:
React
Vite
JavaScript
Tailwind CSS
Socket.IO Client
React Router if routing is needed
Axios or fetch for REST APIs
Web Crypto API for SHA-256
Browser File APIs
IndexedDB only if genuinely required for browser-side transfer recovery; do not introduce it
unnecessarily
Backend
Use:
Node.js
Express
JavaScript
Socket.IO
PostgreSQL
pg / node-postgres
JWT
bcrypt
Redis
ioredis or node-redis
crypto
streams where appropriate
Infrastructure
Use:
Docker
Docker Compose for local development
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
4

<!-- PAGE 5 -->

Nginx
AWS EC2
AWS Application Load Balancer
AWS Auto Scaling Group
Redis
PostgreSQL
For production PostgreSQL, the architecture should support an external managed PostgreSQL database
such as Neon or Amazon RDS.
Do not unnecessarily store large file contents inside PostgreSQL.
4. V1 ARCHITECTURE
The final V1 production architecture should look conceptually like this:
                           INTERNET
                              │
                              ▼
                    ┌──────────────────┐
                    │   AWS ALB        │
                    │ Application      │
                    │ Load Balancer    │
                    └────────┬─────────┘
                             │
             ┌───────────────┼───────────────┐
             │               │               │
             ▼               ▼               ▼
         ┌────────┐      ┌────────┐      ┌────────┐
         │ EC2-1  │      │ EC2-2  │      │ EC2-3  │
         │ Node   │      │ Node   │      │ Node   │
         │Socket.IO      │Socket.IO      │Socket.IO
         └────┬───┘      └────┬───┘      └────┬───┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                       Redis Pub/Sub
                              │
                         PostgreSQL
AWS Auto Scaling Group manages the EC2 instances.
The ALB distributes new client connections across healthy instances.
• 
• 
• 
• 
• 
• 
5

<!-- PAGE 6 -->

Redis Pub/Sub allows different Node.js instances to communicate.
PostgreSQL stores persistent application state.
5. IMPORTANT LIMITATION OF V1
Understand and document this clearly:
In V1, the Node.js infrastructure is still in the file-data path.
For example:
Sender
   │
   │ 2 GB
   ▼
EC2
   │
   │ 2 GB
   ▼
Receiver
Therefore, for a 2 GB transfer , the server infrastructure handles approximately:
2 GB incoming traffic
2 GB outgoing traffic
approximately 4 GB of network traffic, excluding protocol overhead.
This is an intentional V1 limitation.
DO NOT attempt to solve this using WebRTC.
Future V2 can introduce:
WebSocket → signaling
WebRTC → P2P file data
But V1 must remain WebSocket/TCP based.
• 
• 
6

<!-- PAGE 7 -->

6. AUTHENTICATION
Implement secure authentication.
Required:
Register
Login
JWT
Password hashing using bcrypt
Authentication middleware
WebSocket authentication
Never store plain-text passwords.
Database:
users
Suggested fields:
id
username
email
password_hash
created_at
updated_at
last_seen
Username and email should have appropriate unique constraints.
JWT should contain the user's ID.
When establishing a Socket.IO connection, authenticate the socket using the JWT.
Reject unauthenticated WebSocket connections.
7. USER DISCOVERY
Users should be able to search for other registered users.
Example:
• 
• 
• 
• 
• 
• 
7

<!-- PAGE 8 -->

Search username:
[ rahul              ]
Results:
🟢 Rahul
   [Send File]
The REST API can be used for user search.
Example:
GET /api/users/search?q=rahul
Do not expose sensitive information.
Do not return:
password hashes
private authentication information
unnecessary internal fields
The backend should determine whether a user is currently online.
8. ONLINE/OFFLINE PRESENCE
When a user connects:
User → Socket.IO → Node.js
Maintain an in-memory mapping such as:
userId->socketId
However , because multiple Node.js instances exist in the production architecture, do not assume one server
knows every connected user .
Use Redis Pub/Sub for cross-instance presence/events.
Conceptually:
• 
• 
• 
8

<!-- PAGE 9 -->

EC2-1
  │
  ├── Ganesh connected
  │
  └── publish presence event
             ↓
          Redis
             ↓
         EC2-2
Do not use PostgreSQL as the primary real-time socket registry.
PostgreSQL is for persistent state.
Redis is for transient real-time cross-instance communication.
9. TRANSFER MODEL
A transfer must have a unique ID.
Example:
T001
Every message related to a transfer must include the transfer ID.
This is essential because multiple transfers may happen simultaneously over the same WebSocket
connection.
Example:
{
"type": "CHUNK",
"transferId": "T001",
"chunkIndex": 150,
"totalChunks": 2048
}
9

<!-- PAGE 10 -->

10. ONE SENDER → MULTIPLE RECEIVERS
This is a mandatory V1 feature.
Example:
                    ┌──→ Rahul
                    │
Ganesh ── movie.mp4 ┼──→ Amit
                    │
                    └──→ Priya
Do NOT treat this as one transfer .
Create independent transfer records:
T001 → Ganesh → Rahul
T002 → Ganesh → Amit
T003 → Ganesh → Priya
Each recipient must independently maintain:
transfer ID
status
progress
last confirmed chunk
pause/resume state
connection state
checksum
completion state
Example:
T001 → Rahul → 72%
T002 → Amit  → 43%
T003 → Priya → 96%
All can progress independently.
If Rahul pauses, Amit and Priya should continue.
If Rahul disconnects, only Rahul's transfer should need recovery.
• 
• 
• 
• 
• 
• 
• 
• 
10

<!-- PAGE 11 -->

11. MULTIPLE SIMULTANEOUS TRANSFERS
Support multiple transfers simultaneously.
Example:
Ganesh → Rahul → movie.mp4
Ganesh → Amit → project.zip
Rahul  → Ganesh → notes.pdf
Amit   → Priya → dataset.zip
Every transfer must have independent state.
Do not create a global "current transfer" variable.
Use a transfer manager abstraction.
For example:
activeTransfers.set(transferId, transferState);
Design the transfer manager cleanly.
12. LARGE FILE SUPPORT
The application must be designed for large files.
A 2 GB file must NOT be loaded entirely into memory.
Do NOT do:
constentireFile= awaitfile.arrayBuffer();
for a 2 GB file if it results in unnecessarily loading the entire file into memory.
Prefer incremental reading.
Conceptually:
11

<!-- PAGE 12 -->

File
 ↓
Read manageable chunk
 ↓
Send chunk
 ↓
Read next chunk
 ↓
Send
 ↓
...
Use the browser File APIs appropriately.
On the server , use streaming/buffering techniques.
Do not store the entire file in a Node.js memory buffer .
13. CHUNKING
Use application-level chunks.
Start with a configurable default such as:
1 MB
But do not hard-code the assumption that 1 MB is universally optimal.
Make chunk size configurable.
Suggested environment/config value:
CHUNK_SIZE_BYTES
Allow later benchmarking of:
256 KB
1 MB
4 MB
Explain the tradeoff.
• 
• 
• 
12

<!-- PAGE 13 -->

Smaller chunks:
lower retry cost
finer progress
more protocol overhead
Larger chunks:
fewer messages
better throughput potential
more buffering
larger unit of application-level recovery
Do not physically create thousands of files.
"Chunking" means processing manageable sections of the file.
14. STREAMING + CHUNKING
Use both concepts.
Important conceptual distinction:
Streaming:
Do not load the entire file into memory.
Chunking:
Give manageable pieces an application-level identity.
Example:
2 GB file
   ↓
chunk 0
chunk 1
chunk 2
...
chunk 2047
Each chunk should have:
transfer ID
chunk index
• 
• 
• 
• 
• 
• 
• 
• 
• 
13

<!-- PAGE 14 -->

total chunks
byte offset if useful
byte length
15. TRANSFER PROTOCOL
Design a clean application-level protocol.
Suggested message types:
TRANSFER_REQUEST
TRANSFER_ACCEPT
TRANSFER_REJECT
TRANSFER_START
CHUNK
CHUNK_ACK
PAUSE_TRANSFER
PAUSE_ACK
RESUME_TRANSFER
RESUME_ACK
TRANSFER_PROGRESS
TRANSFER_COMPLETE
TRANSFER_FAILED
TRANSFER_CANCEL
TRANSFER_CANCEL_ACK
HASH_VERIFY
HASH_RESULT
TRANSFER_RESUME_REQUEST
TRANSFER_RESUME_RESPONSE
You may simplify this if certain messages are unnecessary.
Every message should have a predictable structure.
Example:
{
"type": "TRANSFER_REQUEST",
"transferId": "T001",
"senderId": "123",
"receiverId": "456",
"fileName": "movie.mp4",
"fileSize": 2147483648,
• 
• 
• 
14

<!-- PAGE 15 -->

"totalChunks": 2048,
"fileHash": "..."
}
16. TRANSFER REQUEST FLOW
The complete flow should be:
Sender
  ↓
Select recipient
  ↓
Select file
  ↓
Create transfer ID
  ↓
TRANSFER_REQUEST
  ↓
Receiver
  ↓
Accept / Reject
  ↓
TRANSFER_ACCEPT
  ↓
TRANSFER_START
  ↓
Begin chunk transfer
Receiver should NOT automatically accept transfers.
Show a confirmation UI.
Example:
Ganesh wants to send:
movie.mp4
2.0 GB
[Accept] [Reject]
15

<!-- PAGE 16 -->

17. CHUNK TRANSFER
For each chunk:
Sender
   ↓
CHUNK #100
   ↓
Receiver
   ↓
CHUNK_ACK #100
The sender should maintain application-level transfer state.
Example:
{
transferId: "T001",
lastConfirmedChunk: 100,
nextChunkToSend: 101,
status: "transferring"
}
18. IMPORTANT: TCP PACKET LOSS
Do NOT implement TCP packet retransmission.
If an individual TCP/IP packet is lost:
Application
    ↓
WebSocket
    ↓
TCP
    ↓
packet loss
TCP itself handles:
sequence numbers• 
16

<!-- PAGE 17 -->

acknowledgements
retransmission
ordering
flow control
The application should not attempt to access or retransmit TCP packets.
Our CHUNK_ACK system is for application-level recovery.
Document this clearly.
19. APPLICATION-LEVEL ACKNOWLEDGEMENTS
The receiver sends acknowledgements for successfully processed chunks.
Example:
Sender:
CHUNK 100
Receiver:
ACK 100
Then:
Sender:
CHUNK 101
Receiver:
ACK 101
The sender stores the last confirmed chunk.
Example:
lastConfirmedChunk= 101;
This becomes the foundation for resume functionality.
• 
• 
• 
• 
17

<!-- PAGE 18 -->

20. DO NOT NECESSARILY WAIT FOR EVERY ACK
For performance, design the transfer system so it can support a configurable number of chunks in flight.
Example:
window size = 8
Sender may send:
100
101
102
103
104
105
106
107
Then receive acknowledgements.
This avoids unnecessarily making the transfer strictly:
send
wait
send
wait
send
wait
which can significantly reduce throughput.
Implement a simple bounded in-flight window.
Make it configurable.
Do not attempt to replace TCP congestion control.
This is application-level flow control and memory management.
18

<!-- PAGE 19 -->

21. BACKPRESSURE
Do not allow unlimited chunks to accumulate in memory.
The system should have bounded buffers.
The transfer manager should respect:
sender throughput
receiver processing
WebSocket buffering
application-level in-flight window
Avoid:
while(...){
socket.send(hugeAmountOfData);
}
Instead implement controlled sending.
Document the reason.
22. PAUSE
When sender clicks pause:
PAUSE_TRANSFER
The transfer state becomes:
PAUSED
Stop generating/sending additional chunks.
Do not destroy the transfer state.
Example:
• 
• 
• 
• 
19

<!-- PAGE 20 -->

{
transferId: "T001",
status: "paused",
lastConfirmedChunk: 1200
}
23. RESUME
When resume is clicked:
RESUME_TRANSFER
Determine the correct starting chunk.
Example:
lastConfirmedChunk = 1200
Continue with:
1201
1202
1203
...
Do not restart from zero.
24. CONNECTION FAILURE
This is a critical V1 feature.
Suppose:
Chunk 0 ✓
Chunk 1 ✓
...
Chunk 1200 ✓
20

<!-- PAGE 21 -->

Connection lost
The system must:
Detect disconnection.
Change transfer status to INTERRUPTED.
Preserve transfer metadata.
Attempt automatic WebSocket reconnection.
Re-authenticate.
Reassociate the client with the transfer .
Determine the last confirmed chunk.
Resume from the next required chunk.
Example:
lastConfirmedChunk = 1200
resume from:
1201
25. RECONNECTION
Implement exponential backoff rather than hammering the server .
For example:
1 second
2 seconds
4 seconds
8 seconds
...
with a maximum retry interval.
Add a reasonable retry limit.
Show the user:
Connection lost.
1. 
2. 
3. 
4. 
5. 
6. 
7. 
8. 
21

<!-- PAGE 22 -->

Reconnecting...
Attempt 2/5
If reconnection succeeds:
Connection restored.
Resuming transfer from chunk 1201...
If it permanently fails:
Transfer interrupted.
[Retry] [Cancel]
Do not silently fail.
26. SERVER RESTART / INSTANCE FAILURE
Because V1 includes AWS Auto Scaling and multiple EC2 instances, the architecture must consider instance
failure.
Do not rely solely on in-memory transfer state for critical recovery information.
Persistent transfer metadata should be stored in PostgreSQL.
At minimum store:
transfer_id
sender_id
receiver_id
file_name
file_size
total_chunks
last_confirmed_chunk
status
file_hash
created_at
updated_at
This allows the transfer to be reconstructed after a server instance changes.
22

<!-- PAGE 23 -->

27. DATABASE SCHEMA
Use PostgreSQL.
Suggested tables:
users
id
username
email
password_hash
created_at
updated_at
last_seen
transfer_groups
A transfer group represents one sender selecting a file and one or more recipients.
id
sender_id
file_name
file_size
file_hash
total_chunks
created_at
transfers
Each recipient gets an independent transfer .
id
group_id
sender_id
receiver_id
status
last_confirmed_chunk
total_chunks
created_at
23

<!-- PAGE 24 -->

updated_at
completed_at
Use foreign keys.
Add appropriate indexes.
For example:
users.username
users.email
transfers.sender_id
transfers.receiver_id
transfers.status
Do NOT store the 2 GB file inside PostgreSQL.
PostgreSQL stores metadata, not the large binary file itself.
28. FILE INTEGRITY
Use SHA-256.
The sender should calculate a file hash.
The receiver should calculate the final reconstructed file hash.
Then:
senderHash === receiverHash
means the file is considered valid.
Display:
✓ Transfer complete
✓ SHA-256 verified
If hashes differ:
24

<!-- PAGE 25 -->

✗ Integrity verification failed
Do not claim a successful transfer if integrity verification fails.
Use the Web Crypto API in the browser where appropriate.
For large files, avoid unnecessary full-file memory buffering.
29. TRANSFER STATUS MODEL
Use explicit statuses.
Suggested:
PENDING
ACCEPTED
TRANSFERRING
PAUSED
INTERRUPTED
COMPLETED
FAILED
CANCELLED
REJECTED
Do not scatter random strings throughout the code.
Centralize status constants.
30. MULTIPLE RECEIVER MODEL
For:
Ganesh → Rahul
Ganesh → Amit
Ganesh → Priya
create:
25

<!-- PAGE 26 -->

Group G001
T001 → Rahul
T002 → Amit
T003 → Priya
The transfers should be completely independent.
If:
T001 = PAUSED
then:
T002 = TRANSFERRING
T003 = TRANSFERRING
must continue normally.
31. REDIS PUB/SUB
Redis is NOT for storing or transmitting the actual 2 GB file.
Do NOT send large file chunks through Redis Pub/Sub.
Redis is for transient cross-instance events.
Examples:
USER_ONLINE
USER_OFFLINE
TRANSFER_REQUEST
TRANSFER_ACCEPTED
TRANSFER_REJECTED
TRANSFER_PAUSED
TRANSFER_RESUMED
TRANSFER_STATUS_CHANGED
TRANSFER_NOTIFICATION
Example:
26

<!-- PAGE 27 -->

EC2-1
  ↓
publish event
  ↓
Redis Pub/Sub
  ↓
EC2-2
  ↓
emit Socket.IO event
  ↓
client
Use Redis only for small control/event messages.
32. SOCKET.IO MULTI-SERVER ARCHITECTURE
Because there are multiple Node.js instances, use a proper Socket.IO Redis adapter if appropriate.
The goal is:
Client A → EC2-1
Client B → EC2-2
and still allow events to reach the correct connected client.
Use Redis-backed Socket.IO communication.
Do not reinvent Socket.IO's cross-node message propagation unnecessarily.
However , still understand and document what Redis is doing.
33. REDIS VS POSTGRESQL
Maintain a clear separation.
PostgreSQL
Persistent:
users• 
27

<!-- PAGE 28 -->

transfer metadata
transfer history
last confirmed chunk
status
Redis
Transient/real-time:
cross-instance pub/sub
presence events
socket-related distributed events
Do not treat Redis as the permanent source of truth for transfer history.
34. AWS ARCHITECTURE
Production V1 should use:
Internet
   ↓
AWS Application Load Balancer
   ↓
Auto Scaling Group
   ↓
Multiple EC2 instances
   ↓
Node.js + Socket.IO
Redis can be hosted using a suitable Redis deployment.
PostgreSQL can be:
Neon
Amazon RDS
another managed PostgreSQL provider
Keep the database connection configurable through environment variables.
35. AUTO SCALING GROUP
Configure an Auto Scaling Group.
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
28

<!-- PAGE 29 -->

The application should support:
minimum instances
desired instances
maximum instances
health checks
automatic replacement of unhealthy instances
Do not hard-code instance-specific assumptions into the application.
The application should be deployable identically on every EC2 instance.
36. APPLICATION LOAD BALANCER
Use AWS ALB.
The ALB should:
route traffic to healthy instances
support HTTP/HTTPS
support WebSocket connections
perform health checks
Create a health endpoint:
GET /health
Response:
{
"status": "ok"
}
Do not make the health endpoint depend on an active WebSocket connection.
37. WEBSOCKET CONNECTIONS AND LOAD
BALANCING
Understand that WebSockets are persistent connections.
• 
• 
• 
• 
• 
• 
• 
• 
• 
29

<!-- PAGE 30 -->

The ALB distributes new connections.
It does not magically migrate an existing WebSocket connection from EC2-1 to EC2-2.
If an instance dies:
Client
   X
EC2-1
the client must reconnect.
Then:
Client
   ↓
ALB
   ↓
EC2-2
The application-level transfer recovery system must resume the transfer from PostgreSQL state.
This behaviour must be tested.
38. HTTPS / WSS
Production deployment must use encrypted transport.
Use:
HTTPS
WSS
TLS
Not plain HTTP/WS for production.
Conceptually:
Browser
   ↓
30

<!-- PAGE 31 -->

WSS
   ↓
ALB / Nginx
   ↓
Node.js
Configure secure cookies/headers where applicable.
Use environment variables for secrets.
Never commit:
JWT secret
database password
Redis credentials
AWS credentials
API keys
39. DOCKER
Create a clean Dockerfile for the backend.
Use a production-oriented Node.js image.
Do not run the application as root if avoidable.
Use:
docker build
docker run
for production deployment.
Docker Compose should be provided for local development, including:
Node.js
PostgreSQL
Redis
Do not require AWS for local development.
• 
• 
• 
• 
• 
31

<!-- PAGE 32 -->

40. LOCAL DEVELOPMENT
The project should run locally with:
docker compose up
or a similarly simple command.
Local architecture:
React
  ↓
Node.js
  ↓
PostgreSQL
Redis
Make the environment configurable.
Example:
.env
variables:
PORT
DATABASE_URL
REDIS_URL
JWT_SECRET
CLIENT_URL
CHUNK_SIZE_BYTES
MAX_FILE_SIZE
MAX_IN_FLIGHT_CHUNKS
NODE_ENV
Do not commit .env.
Provide:
32

<!-- PAGE 33 -->

.env.example
with placeholder values.
41. SECURITY
Implement reasonable security for V1.
Include:
bcrypt password hashing
JWT authentication
WebSocket authentication
authorization checks
file size limits
file metadata validation
username validation
input validation
CORS configuration
rate limiting for authentication endpoints
secure HTTP headers
HTTPS/WSS in production
no secret values in source code
A user must not be able to:
impersonate another user
send a transfer as another user
access another user's transfer
modify another user's transfer state
retrieve arbitrary files
manipulate transfer IDs to access unauthorized transfers
Always verify authorization server-side.
42. FILE VALIDATION
Validate:
filename
file size
MIME type where useful
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
33

<!-- PAGE 34 -->

transfer ownership
recipient authorization
Do not trust client-provided metadata blindly.
Use server-side validation.
Sanitize filenames when writing files.
Do not allow path traversal such as:
../../some-file
43. CLEAN UI
The UI should be modern, minimal, professional, and responsive.
Avoid an over-designed dashboard.
Use a clean file-transfer aesthetic.
Suggested pages:
/login
/register
/dashboard
/transfers
Or use a simple single-page dashboard with modal/dialog flows.
44. DASHBOARD
Example:
┌────────────────────────────────────────────────────┐
│ ⚡ DropShare                         Ganesh  👤     │
├────────────────────────────────────────────────────┤
│                                                    │
│ Find someone                                       │
• 
• 
34

<!-- PAGE 35 -->

│ ┌──────────────────────────────────────────────┐   │
│ │ Search username...                        🔍 │   │
│ └──────────────────────────────────────────────┘   │
│                                                    │
│ Online                                             │
│                                                    │
│ 🟢 Rahul                              [Send File] │
│ 🟢 Amit                               [Send File] │
│ 🔴 Priya                              Offline     │
│                                                    │
├────────────────────────────────────────────────────┤
│ Active Transfers                                   │
│                                                    │
│ movie.mp4 → Rahul                                  │
│ █████████████████░░░  78%                          │
│ 1.56 GB / 2.00 GB                                  │
│ 18.4 MB/s                              [Pause]     │
│                                                    │
│ project.zip → Amit                                 │
│ ██████████░░░░░░░░░  42%                           │
│ 210 MB / 500 MB                                    │
│                                          [Pause]  │
└────────────────────────────────────────────────────┘
45. TRANSFER REQUEST UI
When a recipient receives a request:
┌────────────────────────────────────┐
│ Incoming File                      │
│                                    │
│ Ganesh wants to send:              │
│                                    │
│ 🎬 movie.mp4                       │
│ 2.0 GB                             │
│                                    │
│ [ Reject ]           [ Accept ]    │
└────────────────────────────────────┘
35

<!-- PAGE 36 -->

46. TRANSFER PROGRESS UI
Show:
filename
receiver
percentage
bytes transferred
total bytes
transfer speed
estimated remaining time
status
pause
resume
cancel
retry
Example:
movie.mp4 → Rahul
████████████████░░░░ 78%
1.56 GB / 2.00 GB
Speed: 18.4 MB/s
ETA: 24 seconds
[Pause] [Cancel]
47. MULTI-RECEIVER UI
When selecting recipients:
Send movie.mp4 to:
☑ Rahul
☑ Amit
☑ Priya
☐ Karan
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
36

<!-- PAGE 37 -->

[Send to 3 users]
After starting:
movie.mp4
Rahul  ██████████████░░ 72%
Amit   ████████░░░░░░░░ 43%
Priya  ███████████████░ 91%
Each should have its own controls.
48. ERROR STATES
Handle errors visibly.
Examples:
Recipient offline
Connection lost
Reconnecting
Transfer rejected
File too large
Transfer cancelled
Integrity verification failed
Server unavailable
Transfer expired
Authentication failed
Never leave the UI permanently stuck at:
Transferring...
without explanation.
49. TRANSFER HISTORY
Show:
37

<!-- PAGE 38 -->

Recent Transfers
movie.mp4       → Rahul     ✓ Completed
project.zip     → Amit      ⏸ Paused
dataset.zip     → Priya     ✗ Failed
notes.pdf       ← Rahul     ✓ Received
History should come from PostgreSQL.
50. CODE STRUCTURE
Create a clean, scalable project structure.
Suggested:
project-root/
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── context/
│   │   ├── utils/
│   │   ├── constants/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── sockets/
│   │   ├── transfer/
│   │   ├── redis/
│   │   ├── db/
38

<!-- PAGE 39 -->

│   │   ├── utils/
│   │   ├── constants/
│   │   ├── app.js
│   │   └── server.js
│   ├── package.json
│   └── Dockerfile
│
├── database/
│   ├── migrations/
│   └── seed/
│
├── nginx/
│   └── nginx.conf
│
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
└── package.json
You may improve this structure if there is a strong architectural reason.
Do NOT create hundreds of meaningless files.
Keep the code modular but practical.
51. BACKEND LAYERS
Keep responsibilities separated.
Suggested:
Routes
  ↓
Controllers
  ↓
Services
  ↓
Database
For WebSockets:
39

<!-- PAGE 40 -->

Socket event
  ↓
Authentication
  ↓
Validation
  ↓
Transfer Service
  ↓
Redis / PostgreSQL
  ↓
Socket emission
Do not put the entire application inside one server.js.
52. TRANSFER SERVICE
Create a dedicated transfer management layer .
It should handle concepts such as:
create transfer
accept transfer
reject transfer
start transfer
process chunk
acknowledge chunk
pause transfer
resume transfer
cancel transfer
reconnect transfer
complete transfer
verify hash
Do not mix all of this into Socket.IO event handlers.
Socket handlers should primarily:
receive event
validate/authenticate
call service
emit result
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
1. 
2. 
3. 
4. 
40

<!-- PAGE 41 -->

53. DATABASE CODE
Use parameterized queries.
Do NOT concatenate user input into SQL.
Use migrations.
Create indexes deliberately.
Use transactions where multiple related records must change atomically.
54. REDIS CODE
Create a dedicated Redis module/service.
Do not instantiate random Redis clients throughout the application.
Centralize:
connection
publisher
subscriber
event names
serialization
Handle Redis connection errors.
55. LOGGING
Use structured, useful logs.
Example:
[INFO] User connected userId=123
[INFO] Transfer created transferId=T001
[INFO] Transfer accepted transferId=T001
[INFO] Transfer interrupted transferId=T001
[INFO] User reconnected userId=123
• 
• 
• 
• 
• 
41

<!-- PAGE 42 -->

[INFO] Transfer resumed transferId=T001 chunk=1201
[INFO] Transfer completed transferId=T001
Do NOT log:
passwords
JWT secrets
private file contents
sensitive tokens
56. ERROR HANDLING
Create centralized error handling.
Use consistent API responses.
Example:
{
"success": false,
"message": "Recipient is offline"
}
Do not expose stack traces in production.
Use proper HTTP status codes.
57. SOCKET EVENT VALIDATION
Every incoming Socket.IO event must be validated.
Never trust:
transferId
senderId
receiverId
chunkIndex
fileSize
coming from the client.
• 
• 
• 
• 
42

<!-- PAGE 43 -->

For example, don't allow:
client says:
senderId = someone-else
and blindly trust it.
Derive authenticated user identity from the JWT/socket session.
58. PERFORMANCE REQUIREMENTS
The system should:
avoid loading huge files entirely into memory
limit concurrent chunks in flight
avoid unlimited queues
avoid blocking the Node.js event loop
use streaming where possible
avoid unnecessary database writes for every byte/chunk
avoid sending file data through Redis
avoid unnecessary serialization
keep transfer state manageable
Do not write every individual chunk acknowledgement to PostgreSQL if it causes excessive database load.
Persist progress intelligently, for example periodically or at meaningful checkpoints.
However , ensure enough state exists for recovery.
59. DATABASE WRITE STRATEGY
Do not do:
Chunk 1 → DB write
Chunk 2 → DB write
Chunk 3 → DB write
...
Chunk 2048 → DB write
for every chunk if it causes unnecessary database overhead.
• 
• 
• 
• 
• 
• 
• 
• 
• 
43

<!-- PAGE 44 -->

Instead maintain active state in memory and periodically persist important checkpoints, while ensuring
critical state is durable enough for recovery.
Design this carefully.
60. TESTING
Create tests for:
Authentication
registration
duplicate username
duplicate email
login
invalid password
invalid JWT
User discovery
search
online/offline
authorization
Transfers
request
accept
reject
chunk transfer
ACK
completion
cancellation
Recovery
pause
resume
WebSocket disconnect
reconnect
transfer recovery
server restart simulation
Multi-recipient
Test:
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
44

<!-- PAGE 45 -->

1 sender → 3 receivers
Make sure one receiver failing does not fail the others.
Concurrent transfers
Test:
T001
T002
T003
T004
simultaneously.
Integrity
Test successful and intentionally corrupted transfers.
61. TEST LARGE FILES
Do not only test with:
hello.txt
100 KB
Test progressively:
10 MB
100 MB
500 MB
1 GB
2 GB
Measure:
transfer time
throughput
memory usage
CPU usage
• 
• 
• 
• 
45

<!-- PAGE 46 -->

database load
Redis load
concurrent transfers
Create a test utility for generating large files if necessary.
62. NETWORK FAILURE TESTING
Simulate:
Wi-Fi disconnect
browser tab closing
server restart
EC2 instance failure
WebSocket disconnect
receiver disconnect
sender disconnect
Redis disconnect
database temporary failure
Verify the application responds gracefully.
63. MULTI-INSTANCE TESTING
Run multiple backend instances locally if possible.
Example:
Node 1 → port 5001
Node 2 → port 5002
Node 3 → port 5003
Use Redis Pub/Sub.
Test:
User A connected to Node 1
User B connected to Node 2
and verify they can communicate correctly.
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
46

<!-- PAGE 47 -->

This is essential before AWS deployment.
64. AWS DEPLOYMENT PLAN
Provide a complete deployment guide.
It should cover:
Create VPC/networking if necessary.
Launch/configure EC2 instances.
Install Docker .
Configure environment variables.
Configure security groups.
Configure PostgreSQL.
Configure Redis.
Create AMI or deployment strategy.
Create Target Group.
Create Application Load Balancer .
Configure health checks.
Create Auto Scaling Group.
Configure launch template.
Configure scaling policies.
Configure HTTPS.
Configure domain.
Configure WebSocket support.
Deploy application.
Verify logs.
Perform multi-instance testing.
Do not assume that simply putting Node.js behind an ALB automatically solves state synchronization.
Explain the role of Redis Pub/Sub.
65. NGINX
If Nginx is used in front of Node.js, configure WebSocket upgrade correctly.
For example, conceptually:
Connection: Upgrade
Upgrade: websocket
1. 
2. 
3. 
4. 
5. 
6. 
7. 
8. 
9. 
10. 
11. 
12. 
13. 
14. 
15. 
16. 
17. 
18. 
19. 
20. 
47

<!-- PAGE 48 -->

Make sure long-lived connections and appropriate timeouts are configured.
Do not blindly copy configuration without explaining why it exists.
66. ENVIRONMENT CONFIGURATION
Use environment variables.
Example:
NODE_ENV=development
PORT=5000
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
CLIENT_URL=
CHUNK_SIZE_BYTES=1048576
MAX_FILE_SIZE_BYTES=
MAX_IN_FLIGHT_CHUNKS=8
Provide .env.example.
Never commit real secrets.
67. README
Create a highly professional README.
It must contain:
Project overview
Why the project exists
Features
Architecture diagram
Networking architecture
1. 
2. 
3. 
4. 
5. 
48

<!-- PAGE 49 -->

WebSocket/TCP explanation
Transfer protocol
Chunking explanation
ACK/recovery explanation
Pause/resume explanation
Multi-recipient architecture
Redis Pub/Sub explanation
PostgreSQL schema
AWS architecture
Auto Scaling explanation
ALB explanation
Security
Local setup
Docker setup
Production deployment
Testing
Known V1 limitations
Future V2: WebRTC
The README should explicitly explain:
WebSocket != TCP
WebSocket runs over TCP.
TCP handles network reliability.
Application-level chunks/ACKs handle transfer recovery.
68. DOCUMENT V1 LIMITATIONS
Clearly document:
Limitation 1
The server is in the file-data path.
A → EC2 → B
Limitation 2
Large transfers consume server bandwidth.
6. 
7. 
8. 
9. 
10. 
11. 
12. 
13. 
14. 
15. 
16. 
17. 
18. 
19. 
20. 
21. 
22. 
23. 
49

<!-- PAGE 50 -->

Limitation 3
WebRTC is not implemented.
Limitation 4
P2P transfer is not implemented.
Limitation 5
TURN/STUN is not implemented.
Limitation 6
Redis is used for coordination, not file storage.
These are intentional V1 boundaries.
69. FUTURE V2
Document but DO NOT IMPLEMENT:
V1:
A → Server → B
V2:
A ═════════ B
     WebRTC
Potential V2:
WebRTC DataChannel
STUN
TURN
P2P transfer
server relay fallback
reduced EC2 bandwidth
improved scalability
Do not write V2 code unless explicitly requested.
• 
• 
• 
• 
• 
• 
• 
50

<!-- PAGE 51 -->

70. CODE QUALITY REQUIREMENTS
This is extremely important.
Write clean, structured, production-style JavaScript.
Requirements:
meaningful variable names
meaningful function names
small functions
single responsibility
modular architecture
no giant files
no duplicated logic
no magic numbers
constants for configuration
centralized error handling
centralized validation
reusable utilities
clear service boundaries
async/await
proper Promise handling
graceful shutdown
proper cleanup of sockets/listeners
no memory leaks
no abandoned timers
no unhandled promise rejections
71. COMMENTS
Write useful comments.
Comments should explain:
WHY something is done
networking reasoning
recovery reasoning
architectural decisions
non-obvious algorithms
concurrency decisions
Do NOT comment obvious code like:
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
51

<!-- PAGE 52 -->

// increment i
i++;
Prefer:
// We only persist transfer progress periodically instead of after every
// chunk to avoid generating thousands of database writes for large files.
Comments should help a student understand the networking design.
72. NO FAKE COMPLEXITY
Do not add technologies merely to make the project look impressive.
Every technology must have a reason.
For example:
PostgreSQL → persistent identity and transfer metadata
Redis → cross-instance real-time communication
Socket.IO → persistent real-time client/server communication
TCP → reliable transport underneath WebSocket
ALB → distribute connections
ASG → scaling/replacement
Docker → reproducible deployment
Do not introduce:
Kafka
RabbitMQ
Kubernetes
MongoDB
S3
WebRTC
GraphQL
unless there is a clear V1 requirement.
• 
• 
• 
• 
• 
• 
• 
52

<!-- PAGE 53 -->

73. NO PLACEHOLDER IMPLEMENTATIONS
Do not provide fake functions such as:
functionresumeTransfer(){
// TODO
}
Every V1 feature requested in this prompt must be implemented.
If a production feature cannot safely be implemented in the current environment, explain the limitation
rather than pretending it works.
74. IMPLEMENTATION ORDER
Build in this exact progression.
Phase 1
Project setup.
React
Node.js
Express
PostgreSQL
Redis
Docker
Phase 2
Authentication.
Register
Login
JWT
bcrypt
53

<!-- PAGE 54 -->

Phase 3
User discovery.
Search users
Online/offline
Socket authentication
Phase 4
Basic Socket.IO communication.
Connect
Disconnect
Presence
Transfer request
Accept/reject
Phase 5
Basic file transfer .
File
 ↓
Chunks
 ↓
WebSocket
 ↓
Receiver
Phase 6
Transfer manager .
Transfer IDs
Transfer states
Concurrent transfers
54

<!-- PAGE 55 -->

Phase 7
ACK and flow control.
CHUNK
 ↓
ACK
with bounded in-flight chunks.
Phase 8
Pause/resume.
Phase 9
Connection recovery.
Phase 10
SHA-256 integrity verification.
Phase 11
Multiple recipients.
One sender → multiple receivers
Phase 12
Transfer history.
Phase 13
Redis Pub/Sub multi-instance support.
Phase 14
Docker production build.
55

<!-- PAGE 56 -->

Phase 15
AWS ALB + EC2 + ASG.
Phase 16
HTTPS/WSS.
Phase 17
Performance and failure testing.
Phase 18
Final UI polish and documentation.
75. DEVELOPMENT RULE
Do not try to implement the entire application in one giant response or one giant code dump.
Build it incrementally.
After each major phase:
Explain what was implemented.
Show the relevant files.
Provide the code.
Explain how it works.
Explain how to run it.
Provide tests.
Verify the phase before moving forward.
Do not move to the next major phase if the current phase is fundamentally broken.
76. TEACHING REQUIREMENT
While building the project, explain the networking concepts behind the implementation.
For example, when implementing WebSockets explain:
1. 
2. 
3. 
4. 
5. 
6. 
7. 
56

<!-- PAGE 57 -->

HTTP handshake
     ↓
101 Switching Protocols
     ↓
WebSocket
     ↓
TCP
When implementing chunk ACKs explain:
TCP reliability
        vs
Application transfer recovery
When implementing Redis explain:
Single Node:
User A → Node
Multiple Nodes:
User A → Node 1
User B → Node 2
Redis allows Node 1 ↔ Node 2 communication.
When implementing ALB/ASG explain:
ALB → routing
ASG → capacity/replacement
Redis → cross-instance events
PostgreSQL → durable state
The purpose is not merely to produce code but to create a system that I can confidently explain in a campus
placement interview.
77. FINAL EXPECTED RESULT
At the end of V1, I should have a working application where:
57

<!-- PAGE 58 -->

                    AWS
                     │
                    ALB
                     │
        ┌────────────┼────────────┐
        ↓            ↓            ↓
      EC2-1        EC2-2        EC2-3
        │            │            │
        └────────────┼────────────┘
                     │
                Redis Pub/Sub
                     │
                PostgreSQL
Users can:
Register
   ↓
Login
   ↓
Find users
   ↓
See online users
   ↓
Select multiple recipients
   ↓
Select a large file
   ↓
Send
   ↓
Recipient accepts
   ↓
File is streamed/chunked
   ↓
WebSocket
   ↓
TCP
   ↓
Receiver
   ↓
ACKs
   ↓
Progress
   ↓
Pause/resume
58

<!-- PAGE 59 -->

   ↓
Connection recovery
   ↓
SHA-256 verification
   ↓
Completed
One sender must be able to send to multiple receivers simultaneously:
                    ┌──→ Rahul
                    │
Ganesh ── movie ────┼──→ Amit
                    │
                    └──→ Priya
And multiple independent transfers must work concurrently.
78. FINAL QUALITY BAR
Before declaring V1 complete, verify all of the following:
Authentication works.
PostgreSQL works.
User search works.
Online/offline presence works.
WebSocket authentication works.
Transfer requests work.
Receiver approval works.
Large files can be transferred.
Files are not unnecessarily loaded entirely into RAM.
Chunking works.
Multiple transfers work simultaneously.
One sender can send to multiple receivers.
Each recipient has independent transfer state.
Application-level ACKs work.
Pause works.
Resume works.
WebSocket reconnection works.
Transfer resumes from the correct confirmed chunk.
SHA-256 verification works.
Failed transfers are handled.
Redis Pub/Sub works between multiple Node.js instances.
Multiple Node.js instances can communicate.
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
59

<!-- PAGE 60 -->

PostgreSQL persists transfer metadata.
File data is NOT sent through Redis.
ALB works.
WebSocket connections work behind ALB.
ASG can replace unhealthy instances.
Application can reconnect after an instance failure.
HTTPS/WSS works.
Docker deployment works.
Production secrets are not committed.
UI is clean and responsive.
README explains the architecture.
V1 limitations are documented.
No WebRTC code exists.
No unnecessary technologies have been added.
MOST IMPORTANT INSTRUCTION
Do not over-engineer V1.
The objective is not to build Dropbox or AirDrop.
The objective is to build a clean, reliable, scalable V1 networking project that I can fully understand and
explain.
Prioritize:
correctness → reliability → clean architecture → performance → UI polish → scalability.
Do not sacrifice correctness just to add more features.
Use JavaScript only throughout the project.
Write clean, structured code with meaningful comments explaining important architectural and networking
decisions.
Build the project incrementally and make every phase actually runnable before proceeding.
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
• 
60
