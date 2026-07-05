import express from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";
import { middleware } from "./middleware.js";
import { CreateRoomSchema, CreateUserSchema, SigninSchema } from "@repo/common/types";
import { PrismaClient } from "@prisma/client";
import cors from 'cors';
import bcrypt from "bcryptjs";
import cookieParser from 'cookie-parser'; 

const app = express();
app.use(express.json());
app.use(cookieParser());


app.use(cors({
  origin: 'http://localhost:3000', 
  credentials: true,
}));

const prismaClient = new PrismaClient();

app.post("/signup", async (req, res) => {

  console.log("BACKEND: Received a request for /signup");
  console.log("BACKEND: Request body received:", req.body);

  const parsedData = CreateUserSchema.safeParse(req.body);
  console.log(parsedData)
  if (!parsedData.success) {
    return res.status(400).json({ message: "Invalid input" });
  }

  try {
    const { username, password, name } = parsedData.data;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await prismaClient.user.create({
      data: {
        email: username,
        password: hashedPassword, 
        name: name
      }
    });
    res.status(201).json({ message: "User created successfully" });

  } catch (e) {
    res.status(409).json({ message: "User already exists" });
  }
});

app.post("/signin", async (req, res) => { 
  const parsedData = SigninSchema.safeParse(req.body);

  console.log(parsedData)
  if (!parsedData.success) {
    return res.status(400).json({ message: "Incorrect inputs" });
  }

  const { username, password } = parsedData.data;

  try {
    const user = await prismaClient.user.findFirst({
      where: {
        email: username
      }
    });

    if (!user) {
      return res.status(403).json({ "message": "Invalid user" });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
      return res.status(403).json({ "message": "Invalid password" });
    }

    const userId = user.id;
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1d' });

    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.status(200).json({ message: "Sign in successful" });
  } catch (e) {
    console.error("Signin failed:", e);
    res.status(500).json({ message: "Something went wrong during sign in" });
  }
});
app.post("/api/logout", (req, res) => {

  res.cookie('authToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0 
  });

  res.status(200).json({ message: "Logged out successfully" });
});

app.post("/room", middleware, async (req, res) => {
   const parsedData = CreateRoomSchema.safeParse(req.body);
   if(!parsedData.success){
      return res.status(400).json({
         message: "Incorrect input for room name",
      });
   }

   const userId = req.userId;

   if (typeof userId !== "string") {
      return res.status(400).json({ message: "Invalid userId" });
   }

   try {
     const room = await prismaClient.room.create({ 
        data: {
           slug: parsedData.data.name,
           adminId: userId
        }
     });
     res.status(201).json(room);
      
   } catch(e){
      res.status(409).json({
         message: "A room with that name already exists"
      });
   }
});

app.get("/chats/:roomId", middleware, async (req, res) => { 
  try {
    const roomId = Number(req.params.roomId);
    if (isNaN(roomId)) {
      return res.status(400).json({ message: "Invalid room ID" });
    }

    const messages = await prismaClient.chat.findMany({
      where: {
        roomId: roomId
      },
      orderBy: {
        id : "desc"
      },
      take: 50
    });

    res.json({ messages: messages.reverse() });

  } catch(e){
    console.error(e);
    res.status(500).json({ message: "Failed to retrieve chat history" });
  }
});

// app.get("/room/:slug", middleware, async (req, res) => { 
//     const slug = req.params.slug;
//     if (!slug) {
//         return res.status(400).json({ message: "Room slug is required" });
//     }
app.get("/messages/:roomId", middleware, async (req, res) => {
  try {
    const roomId = Number(req.params.roomId);
    if (isNaN(roomId)) {
      return res.status(400).json({ message: "Invalid room ID" });
    }

    const messages = await prismaClient.textMessage.findMany({
      where: { roomId },
      orderBy: { id: "asc" },
      take: 100,
      include: {
        user: {
          select: { name: true }
        }
      }
    });

    res.json({ messages });
  } catch (e) {
    console.error("Failed to fetch messages:", e);
    res.status(500).json({ message: "Failed to retrieve chat messages" });
  }
});
app.get("/room/:slug", middleware, async (req, res) => { 
    const slug = req.params.slug;
    if (!slug || Array.isArray(slug)) {
        return res.status(400).json({ message: "Room slug is required" });
    }
    
    const room = await prismaClient.room.findFirst({
        where: {
         slug: slug
      }
    });

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }
    res.json({ room });
});
// Resolves a shareable, unguessable publicId (UUID) to the room's real
// data, including its internal numeric id used everywhere else
// (chat history, websocket join, messages). Kept as a separate path
// ("/rooms/...") rather than nesting under "/room/:slug" to avoid any
// route-matching ambiguity between the two.
app.get("/rooms/:publicId", middleware, async (req, res) => {
  try {
    const publicId = req.params.publicId;
    if (!publicId || Array.isArray(publicId)) {
      return res.status(400).json({ message: "Room publicId is required" });
    }

    const room = await prismaClient.room.findFirst({
      where: { publicId }
    });

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }
    res.json({ room });
  } catch (e) {
    console.error("Failed to resolve room by publicId:", e);
    res.status(500).json({ message: "Failed to resolve room" });
  }
});
app.post("/ws/token", middleware, (req, res) => {
  const userId = req.userId as string; 
  const wsToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '60s' }); 
  res.json({ wsToken });
});

app.get("/api/user/rooms",middleware, async (req, res) => {
  const userId = req.userId;

  if(!userId){
    return res.status(403).json({message: "Unauthorized"})
  }

  try {
    const rooms = await prismaClient.room.findMany({
      where: {
        adminId: userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    res.status(200).json(rooms);
  } catch (error) {
    console.error("Failed to fetch rooms:", error);
    res.status(500).json({ message: "Internal server error" });
  }

})

app.listen(3005, () => {
  console.log('Server listening on port 3005');
});