import { Tool } from "@/components/Canvas";
import { getExistingShapes, Shape } from "./http";
import { v4 as uuidv4 } from 'uuid';

export class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private roomId: string;
    public socket: WebSocket;

    // State Management
    private existingShapes: Shape[] = [];
    private isDrawing = false;
    private selectedTool: Tool = "pencil";
    
    // Properties for drawing logic
    private startX = 0;
    private startY = 0;
    private cursorX = 0;
    private cursorY = 0;
    private currentStrokeId: string | null = null; // Groups pencil strokes
    private strokePoints: { x: number, y: number }[] = []; // All points in the current pencil stroke, for shape detection
    private strokeShapeIds: string[] = []; // IDs of the raw segments sent for the current stroke, so they can be replaced
    
    // Properties for temporary previews
    private previewShape: Shape | null = null;
    private eraserPath: { x: number, y: number }[] = [];

    // Live cursors of other users currently in the room
    private remoteCursors: Map<string, { x: number, y: number, name: string, color: string }> = new Map();
    private lastCursorSentAt = 0;

    constructor(canvas: HTMLCanvasElement, roomId: string, socket: WebSocket) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
        this.roomId = roomId;
        this.socket = socket;
        this.init();
    }

    private async init() {
        this.initHandlers();
        this.initMouseHandlers();
        this.existingShapes = await getExistingShapes(this.roomId);
        this.redrawCanvas();
    }

    // --- Public Methods ---
    public destroy() {
        this.canvas.removeEventListener("mousedown", this.mouseDownHandler);
        this.canvas.removeEventListener("mouseup", this.mouseUpHandler);
        this.canvas.removeEventListener("mousemove", this.mouseMoveHandler);
        this.canvas.removeEventListener("mouseleave", this.mouseLeaveHandler);
    }

    public setTool(tool: Tool) {
        this.selectedTool = tool;
        this.redrawCanvas();
    }

    // --- Central Drawing Loop ---
    public redrawCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const style = getComputedStyle(document.documentElement);
        this.ctx.fillStyle = `hsl(${style.getPropertyValue('--background').trim()})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Draw all permanent shapes
        this.existingShapes.forEach(shape => this.drawShape(shape, `hsl(${style.getPropertyValue('--foreground').trim()})`));

        // 2. Draw any temporary preview shape
        if (this.previewShape) {
            this.drawShape(this.previewShape, `hsl(${style.getPropertyValue('--primary').trim()})`);
        }

        // 3. Draw the temporary eraser trail
        if (this.eraserPath.length > 0) {
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(this.eraserPath[0].x, this.eraserPath[0].y);
            this.eraserPath.forEach(point => this.ctx.lineTo(point.x, point.y));
            this.ctx.stroke();
        }

        // 4. Draw the eraser cursor head
        if (this.selectedTool === 'eraser') {
            this.drawEraserCursor();
        }

        // 5. Draw everyone else's live cursor + name
       // 5. Draw everyone else's live cursor + name
this.remoteCursors.forEach((cursor) => {
    // The cursor dot itself
    this.ctx.fillStyle = cursor.color;
    this.ctx.beginPath();
    this.ctx.arc(cursor.x, cursor.y, 5, 0, Math.PI * 2);
    this.ctx.fill();

    // Name label, drawn as a small pill clearly above the dot
    // (fillText's y is the text BASELINE, so we need real
    // vertical clearance, not just a few px).
    this.ctx.font = '12px sans-serif';
    const paddingX = 6;
    const paddingY = 4;
    const textWidth = this.ctx.measureText(cursor.name).width;
    const labelHeight = 12 + paddingY * 2;
    const labelX = cursor.x + 8;
    const labelY = cursor.y - 24 - labelHeight;

    this.ctx.fillStyle = cursor.color;
    this.ctx.fillRect(labelX, labelY, textWidth + paddingX * 2, labelHeight);

    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText(cursor.name, labelX + paddingX, labelY + labelHeight - paddingY - 2);
});
    }
    
    // --- Mouse Event Handlers ---
    private mouseDownHandler = (e: MouseEvent) => {
        this.isDrawing = true;
        this.startX = e.clientX;
        this.startY = e.clientY;

        // If using the pencil, generate a unique ID for this entire stroke
        if (this.selectedTool === 'pencil') {
            this.currentStrokeId = uuidv4();
            this.strokePoints = [{ x: this.startX, y: this.startY }];
            this.strokeShapeIds = [];
        }
        if (this.selectedTool === 'eraser') {
            this.eraserPath = [{ x: e.clientX, y: e.clientY }];
        }
    }

    private mouseMoveHandler = (e: MouseEvent) => {
        this.cursorX = e.clientX;
        this.cursorY = e.clientY;

        this.broadcastCursorPosition(e.clientX, e.clientY);

        if (!this.isDrawing) {
            if (this.selectedTool === 'eraser') this.redrawCanvas();
            return;
        }

        switch (this.selectedTool) {
            case 'pencil':
                this.handlePencilMove(e.clientX, e.clientY);
                break;
            case 'eraser':
                this.eraserPath.push({ x: e.clientX, y: e.clientY });
                break;
            case 'rect':
            case 'circle':
                this.previewShape = this.createPreviewShape(e.clientX, e.clientY);
                break;
        }
        this.redrawCanvas();
    }

    private mouseUpHandler = (e: MouseEvent) => {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        
        if (this.selectedTool === 'eraser') {
            this.finalizeErasing();
        } else if (this.previewShape) {
            const finalShape = { ...this.previewShape, id: uuidv4() };
            this.sendShape(finalShape);
        } else if (this.selectedTool === 'pencil') {
            this.tryAutoCorrectStroke();
        }
        
        // Cleanup temporary state for the next action
        this.previewShape = null;
        this.currentStrokeId = null;
        this.strokePoints = [];
        this.strokeShapeIds = [];
        this.eraserPath = [];
        this.redrawCanvas();
    }
    
    private mouseLeaveHandler = () => {
        this.cursorX = -100;
        this.cursorY = -100;
        if (this.selectedTool === 'eraser') {
            this.redrawCanvas();
        }
    }

    // --- Helper & Logic Methods ---
    private handlePencilMove(endX: number, endY: number) {
        const shape: Shape = {
            id: uuidv4(), 
            type: "pencil",
            startX: this.startX, 
            startY: this.startY,
            endX, 
            endY,
            strokeId: this.currentStrokeId!, // Apply the shared strokeId
        };
        this.strokeShapeIds.push(shape.id);
        this.strokePoints.push({ x: endX, y: endY });
        this.sendShape(shape);
        this.startX = endX;
        this.startY = endY;
    }

    private createPreviewShape(endX: number, endY: number): Shape {
        const x = Math.min(this.startX, endX);
        const y = Math.min(this.startY, endY);
        const width = Math.abs(endX - this.startX);
        const height = Math.abs(endY - this.startY);
        return {
            id: 'preview', 
            type: this.selectedTool as 'rect' | 'circle',
            x, 
            y, 
            width, 
            height,
        };
    }

    private finalizeErasing() {
        const allIdsToDelete = new Set<string>();
        const strokeIdsToDelete = new Set<string>();

        for (const point of this.eraserPath) {
            for (const shape of this.existingShapes) {
                if (allIdsToDelete.has(shape.id)) continue;
                if (shape.type === 'pencil' && shape.strokeId && strokeIdsToDelete.has(shape.strokeId)) continue;
                
                let hit = false;
                if (shape.type === 'rect' || shape.type === 'circle') {
                    const minX = Math.min(shape.x, shape.x + shape.width);
                    const maxX = Math.max(shape.x, shape.x + shape.width);
                    const minY = Math.min(shape.y, shape.y + shape.height);
                    const maxY = Math.max(shape.y, shape.y + shape.height);
                    hit = (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY);
                } else if (shape.type === 'pencil') {
                    hit = this.isPointNearLine(point, shape.startX, shape.startY, shape.endX, shape.endY, 10);
                }
                
                if (hit) {
                    if (shape.type === 'pencil' && shape.strokeId) {
                        // If we hit a pencil segment, record its entire strokeId for deletion
                        strokeIdsToDelete.add(shape.strokeId);
                    } else {
                        // For other shapes, just delete that specific shape
                        allIdsToDelete.add(shape.id);
                    }
                }
            }
        }
        
        // After checking the path, find all segments that match the collected strokeIds
        if (strokeIdsToDelete.size > 0) {
            this.existingShapes.forEach(shape => {
                if (shape.type === 'pencil' && shape.strokeId && strokeIdsToDelete.has(shape.strokeId)) {
                    allIdsToDelete.add(shape.id);
                }
            });
        }
        
        if (allIdsToDelete.size > 0) {
            const ids = Array.from(allIdsToDelete);
            this.existingShapes = this.existingShapes.filter(shape => !ids.includes(shape.id));
            this.socket.send(JSON.stringify({ type: "delete_shapes", payload: { ids }, roomId: this.roomId }));
        }
    }

    // --- Drawing & Networking ---
    private initHandlers() {
        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === "chat") {
                const newShape = JSON.parse(message.message).shape;
                if (!this.existingShapes.some(s => s.id === newShape.id)) {
                    this.existingShapes.push(newShape);
                }
                this.redrawCanvas();
            } else if (message.type === "delete_shapes") {
                const idsToDelete: string[] = message.payload.ids;
                this.existingShapes = this.existingShapes.filter(shape => !idsToDelete.includes(shape.id));
                this.redrawCanvas();
            } else if (message.type === "cursor_move") {
                this.remoteCursors.set(message.userId, {
                    x: message.x,
                    y: message.y,
                    name: message.senderName,
                    color: this.colorForUser(message.userId),
                });
                this.redrawCanvas();
            } else if (message.type === "user_left") {
                this.remoteCursors.delete(message.userId);
                this.redrawCanvas();
            }
        };
    }

    private initMouseHandlers() {
        this.canvas.addEventListener("mousedown", this.mouseDownHandler);
        this.canvas.addEventListener("mouseup", this.mouseUpHandler);
        this.canvas.addEventListener("mousemove", this.mouseMoveHandler);
        this.canvas.addEventListener("mouseleave", this.mouseLeaveHandler);
    }

    private drawShape(shape: Shape, color: string) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        if (shape.type === "rect") {
            this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
        } else if (shape.type === "circle") {
            const radius = Math.sqrt(shape.width * shape.width + shape.height * shape.height) / 2;
            this.ctx.beginPath();
            this.ctx.arc(shape.x + shape.width / 2, shape.y + shape.height / 2, Math.abs(radius), 0, Math.PI * 2);
            this.ctx.stroke();
        } else if (shape.type === "pencil") {
            this.ctx.beginPath();
            this.ctx.moveTo(shape.startX, shape.startY);
            this.ctx.lineTo(shape.endX, shape.endY);
            this.ctx.stroke();
        }
    }

    private drawEraserCursor() {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(this.cursorX, this.cursorY, 10, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
    }

    // Sends our own cursor position to everyone else in the room, throttled
    // so a fast mouse doesn't flood the socket with dozens of messages per
    // second.
    private broadcastCursorPosition(x: number, y: number) {
        const now = Date.now();
        if (now - this.lastCursorSentAt < 50) return; // ~20 updates/sec max
        this.lastCursorSentAt = now;
        this.socket.send(JSON.stringify({ type: 'cursor_move', roomId: this.roomId, x, y }));
    }

    // Deterministic color per userId, so the same person always shows up
    // as the same color across reconnects and for every other viewer.
    private colorForUser(userId: string): string {
        const palette = ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA', '#F472B6', '#38BDF8', '#FB923C'];
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            hash = userId.charCodeAt(i) + ((hash << 5) - hash);
        }
        return palette[Math.abs(hash) % palette.length];
    }

    private sendShape(shape: Shape) {
        this.existingShapes.push(shape);
        this.socket.send(JSON.stringify({ type: "chat", message: JSON.stringify({ shape }), roomId: this.roomId }));
    }


    private isPointNearLine(point: {x: number, y: number}, x1: number, y1: number, x2: number, y2: number, threshold: number): boolean {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) {
            return Math.sqrt(Math.pow(point.x - x1, 2) + Math.pow(point.y - y1, 2)) < threshold;
        }
        let t = ((point.x - x1) * dx + (point.y - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const closestX = x1 + t * dx;
        const closestY = y1 + t * dy;
        const distance = Math.sqrt(Math.pow(point.x - closestX, 2) + Math.pow(point.y - closestY, 2));
        return distance < threshold;
    }

    // --- Shape Auto-Correction ---
    // After a pencil stroke is finished, checks if it clearly traces a
    // circle, rectangle, or straight line. If so, deletes the raw wobbly
    // segments and replaces them with one clean shape. If the stroke is
    // ambiguous, it is left completely untouched.
    private tryAutoCorrectStroke() {
        if (this.strokeShapeIds.length === 0) return;

        const detected = this.detectShape(this.strokePoints);
        if (!detected) return;

        const idsToRemove = this.strokeShapeIds;
        this.existingShapes = this.existingShapes.filter(s => !idsToRemove.includes(s.id));
        this.socket.send(JSON.stringify({
            type: "delete_shapes",
            payload: { ids: idsToRemove },
            roomId: this.roomId
        }));

        this.sendShape(detected);
    }

    private detectShape(points: { x: number, y: number }[]): Shape | null {
        if (points.length < 8) return null; // too short to reliably classify

        const box = this.getBoundingBox(points);
        const diagonal = Math.sqrt(box.width * box.width + box.height * box.height);
        if (diagonal < 20) return null; // basically a dot/click, ignore

        const first = points[0];
        const last = points[points.length - 1];
        const closingGap = Math.hypot(last.x - first.x, last.y - first.y);
        const isClosed = closingGap < diagonal * 0.25;

        if (isClosed) {
            return this.tryFitRect(points, box) ?? this.tryFitCircle(points, box);
        } else {
            return this.tryFitLine(points, first, last);
        }
    }

    private getBoundingBox(points: { x: number, y: number }[]) {
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
    }

    private tryFitCircle(
        points: { x: number, y: number }[],
        box: { minX: number, maxX: number, minY: number, maxY: number, width: number, height: number }
    ): Shape | null {
        const cx = (box.minX + box.maxX) / 2;
        const cy = (box.minY + box.maxY) / 2;

        const distances = points.map(p => Math.hypot(p.x - cx, p.y - cy));
        const avgR = distances.reduce((a, b) => a + b, 0) / distances.length;
        if (avgR < 5) return null;

        const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgR, 2), 0) / distances.length;
        const relativeError = Math.sqrt(variance) / avgR;

        // Hand-drawn circles typically stay within ~20% radius deviation
        if (relativeError < 0.2) {
            const diameter = avgR * 2;
            return {
                id: uuidv4(),
                type: "circle",
                x: cx - diameter / 2,
                y: cy - diameter / 2,
                width: diameter,
                height: diameter,
            };
        }
        return null;
    }

    private tryFitRect(
        points: { x: number, y: number }[],
        box: { minX: number, maxX: number, minY: number, maxY: number, width: number, height: number }
    ): Shape | null {
        if (box.width < 10 || box.height < 10) return null;

        const edgeThreshold = Math.max(box.width, box.height) * 0.08;
        let onEdgeCount = 0;

        for (const p of points) {
            const distLeft = Math.abs(p.x - box.minX);
            const distRight = Math.abs(p.x - box.maxX);
            const distTop = Math.abs(p.y - box.minY);
            const distBottom = Math.abs(p.y - box.maxY);
            const minDist = Math.min(distLeft, distRight, distTop, distBottom);
            if (minDist <= edgeThreshold) onEdgeCount++;
        }

        const edgeRatio = onEdgeCount / points.length;

        // Edge-hugging alone isn't enough: a circle also touches its bounding
        // box near its four cardinal points. A real rectangle is additionally
        // made of long straight runs interrupted by a few sharp corners,
        // while a circle curves continuously with no straight runs at all.
        // Resampling at even arc-length spacing makes this check independent
        // of how fast or slow the stroke was drawn.
        const resampled = this.resamplePoints(points, 24);
        const straightFraction = this.computeStraightFraction(resampled);

        if (edgeRatio > 0.75 && straightFraction > 0.45) {
            return {
                id: uuidv4(),
                type: "rect",
                x: box.minX,
                y: box.minY,
                width: box.width,
                height: box.height,
            };
        }
        return null;
    }

    // Resamples a stroke into `numSamples` points evenly spaced by arc
    // length, so shape analysis isn't skewed by drawing speed (fast strokes
    // produce fewer raw mousemove points per unit length than slow ones).
    private resamplePoints(points: { x: number, y: number }[], numSamples: number): { x: number, y: number }[] {
        if (points.length < 2) return points;

        const cumulative: number[] = [0];
        for (let i = 1; i < points.length; i++) {
            const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
            cumulative.push(cumulative[i - 1] + d);
        }
        const totalLength = cumulative[cumulative.length - 1];
        if (totalLength === 0) return points;

        const resampled: { x: number, y: number }[] = [];
        for (let s = 0; s < numSamples; s++) {
            const targetDist = (s / (numSamples - 1)) * totalLength;
            let idx = 0;
            while (idx < cumulative.length - 1 && cumulative[idx + 1] < targetDist) idx++;
            const segStart = cumulative[idx];
            const segEnd = cumulative[Math.min(idx + 1, cumulative.length - 1)];
            const segLen = segEnd - segStart;
            const t = segLen > 0 ? (targetDist - segStart) / segLen : 0;
            const p0 = points[idx];
            const p1 = points[Math.min(idx + 1, points.length - 1)];
            resampled.push({
                x: p0.x + (p1.x - p0.x) * t,
                y: p0.y + (p1.y - p0.y) * t,
            });
        }
        return resampled;
    }

    // Fraction of interior points where the stroke barely changes direction
    // (i.e. the path is locally straight). Rectangles score high here
    // (~0.8-0.9, since most points sit along a straight side); circles score
    // near 0, since a circle's direction changes continuously everywhere.
    private computeStraightFraction(points: { x: number, y: number }[], angleThresholdDeg = 12): number {
        if (points.length < 5) return 0;

        let straightCount = 0;
        let total = 0;

        for (let i = 1; i < points.length - 1; i++) {
            const v1 = { x: points[i].x - points[i - 1].x, y: points[i].y - points[i - 1].y };
            const v2 = { x: points[i + 1].x - points[i].x, y: points[i + 1].y - points[i].y };
            const len1 = Math.hypot(v1.x, v1.y);
            const len2 = Math.hypot(v2.x, v2.y);
            if (len1 === 0 || len2 === 0) continue;

            const dot = (v1.x * v2.x + v1.y * v2.y) / (len1 * len2);
            const clamped = Math.max(-1, Math.min(1, dot));
            const angleDeg = Math.acos(clamped) * (180 / Math.PI);

            total++;
            if (angleDeg < angleThresholdDeg) straightCount++;
        }

        return total > 0 ? straightCount / total : 0;
    }

    private tryFitLine(
        points: { x: number, y: number }[],
        first: { x: number, y: number },
        last: { x: number, y: number }
    ): Shape | null {
        const lineLength = Math.hypot(last.x - first.x, last.y - first.y);
        if (lineLength < 30) return null; // too short for straightening to matter

        let maxDeviation = 0;
        for (const p of points) {
            const deviation = this.isPointNearLineDistance(p, first, last);
            if (deviation > maxDeviation) maxDeviation = deviation;
        }

        const relativeDeviation = maxDeviation / lineLength;

        // Hand-drawn straight lines typically deviate less than ~6% of their length
        if (relativeDeviation < 0.06) {
            return {
                id: uuidv4(),
                type: "pencil",
                startX: first.x,
                startY: first.y,
                endX: last.x,
                endY: last.y,
                strokeId: uuidv4(),
            };
        }
        return null;
    }

    private isPointNearLineDistance(point: { x: number, y: number }, lineStart: { x: number, y: number }, lineEnd: { x: number, y: number }): number {
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
        const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq;
        const closestX = lineStart.x + t * dx;
        const closestY = lineStart.y + t * dy;
        return Math.hypot(point.x - closestX, point.y - closestY);
    }
}