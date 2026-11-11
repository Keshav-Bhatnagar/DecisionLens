from typing import Dict, List
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("decisionlens.meeting_ws")

router = APIRouter()


class MeetingConnectionManager:
    """Manages active WebSockets for peer-to-peer WebRTC video room signaling."""

    def __init__(self):
        # Mapping from room_id to list of active WebSockets
        self.active_rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        if room_id not in self.active_rooms:
            self.active_rooms[room_id] = []
        self.active_rooms[room_id].append(websocket)
        logger.info(f"Client connected to room '{room_id}'. Total peers: {len(self.active_rooms[room_id])}")

        # Notify other peers that a new participant has joined
        await self.broadcast_to_room(
            room_id,
            {"type": "peer-joined", "peerCount": len(self.active_rooms[room_id])},
            sender=websocket,
        )

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.active_rooms:
            if websocket in self.active_rooms[room_id]:
                self.active_rooms[room_id].remove(websocket)
            if not self.active_rooms[room_id]:
                del self.active_rooms[room_id]
                logger.info(f"Room '{room_id}' closed (empty).")
            else:
                logger.info(f"Client disconnected from room '{room_id}'. Remaining peers: {len(self.active_rooms[room_id])}")

    async def broadcast_to_room(self, room_id: str, message: dict, sender: WebSocket = None):
        if room_id in self.active_rooms:
            dead_connections = []
            for connection in self.active_rooms[room_id]:
                if connection != sender:
                    try:
                        await connection.send_text(json.dumps(message))
                    except Exception as exc:
                        logger.warning(f"Failed to send to peer in '{room_id}': {exc}")
                        dead_connections.append(connection)

            for dead in dead_connections:
                self.disconnect(room_id, dead)


manager = MeetingConnectionManager()


@router.websocket("/ws/meeting/{room_id}")
async def websocket_meeting_endpoint(websocket: WebSocket, room_id: str):
    """
    WebSocket endpoint for real-time WebRTC signaling (offers, answers, ICE candidates).
    Allows native in-app video deliberation calls without third-party services.
    """
    await manager.connect(room_id, websocket)
    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
                # Forward SDP offers, answers, and ICE candidates to other room peers
                await manager.broadcast_to_room(room_id, data, sender=websocket)
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON message received on room '{room_id}'")
    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
        # Notify remaining peers that someone left
        peer_count = len(manager.active_rooms.get(room_id, []))
        await manager.broadcast_to_room(
            room_id,
            {"type": "peer-left", "peerCount": peer_count},
        )
    except Exception as exc:
        logger.error(f"Error in meeting websocket for room '{room_id}': {exc}")
        manager.disconnect(room_id, websocket)


@router.get("/api/meeting/{room_id}/status")
async def get_meeting_room_status(room_id: str):
    """Return participant count and health for an in-app meeting room."""
    count = len(manager.active_rooms.get(room_id, []))
    return {
        "room_id": room_id,
        "active_participants": count,
        "mode": "native-webrtc",
    }

