# BeautiQ Backend

Node.js/Express REST API for the BeautiQ beauty services platform.

## Tech Stack
- Node.js + Express
- MongoDB Atlas
- Socket.IO
- AWS S3 (File Storage)
- AWS Lambda (Sentiment Analysis)
- Stripe Payments

## AWS Services
- **S3** - Profile images, certificates, documents
- **Lambda** - Feedback sentiment analysis trigger
- **EC2/ECS** - Container deployment

## CI/CD
- GitHub Actions for automated deployment
- Docker containerization

## Setup

```bash
npm install
npm run dev
```

## Docker

```bash
docker-compose up --build
```

## API Routes
- `/api/auth` - Authentication
- `/api/services` - Service management
- `/api/bookings` - Booking management
- `/api/payments` - Payment processing
- `/api/chat` - Real-time chat
- `/api/notifications` - Notifications
- `/api/feedback` - Reviews & sentiment analysis

## License
MIT
