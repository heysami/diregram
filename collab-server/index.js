const { Server } = require('@hocuspocus/server')

const server = new Server({
  // Many hosts (Render/Fly/Railway/etc.) inject a PORT env var. Default to 1234 for local dev.
  port: Number(process.env.PORT) || 1234,
  async onConnect(data) {
    console.log(`Client connected to document: ${data.documentName}`)
  },
  async onDisconnect(data) {
    console.log(`Client disconnected from document: ${data.documentName}`)
  },
})

server.listen().then(() => {
  console.log(`Collab server is running on port ${Number(process.env.PORT) || 1234}`)
})
