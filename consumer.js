//consumer.js

const { Kafka } = require("kafkajs");
const { Client } = require("@elastic/elasticsearch");

// Create a Kafka instance
// clientId identifies this service to Kafka
// brokers tells where Kafka is running
const kafka = new Kafka({
  clientId: "activity-consumer",
  brokers: ["localhost:9092"]
});

// Create a Kafka consumer
// groupId ensures messages are processed only once per group
//Load can be shared if multiple consumers exist
const consumer = kafka.consumer({ 
  groupId: "activity-group"
});

// Elasticsearch
const elasticClient = new Client({
  node: "http://localhost:9200" //This node will store indexed documents
});

async function run() {
  // Connect Elasticsearch
  await elasticClient.ping();
  console.log("✅ Elasticsearch connected");

  // Connect Kafka
  await consumer.connect();

  await consumer.subscribe({
    topic: "activity-log",
    fromBeginning: false   // fromBeginning: false means read only new messages
  });

  console.log("📥 Kafka consumer running");

  await consumer.run({
    eachMessage: async ({ message }) => {
      const log = JSON.parse(message.value.toString());// Convert Kafka message from Buffer to JSON

      console.log("📝 Received:", log);

      // Index into Elasticsearch
      await elasticClient.index({
        index: "activity-logs",
        document: {
          type: log.type, //Activity type (message, join, etc.)
          userId: log.payload.userId,  //User who performed the activity
          roomId: log.payload.roomId || null,  //Room where activity occurred (if applicable)
          timestamp: log.timestamp  //When activity occurred
        }
      });
    }
  });
}

run().catch(console.error);
