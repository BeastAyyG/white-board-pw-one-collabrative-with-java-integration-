import test from 'node:test';
import assert from 'node:assert/strict';
import { isPointInElement, createBotCollaborator } from './canvasModel.ts';
import { CanvasElement } from '../types/index.ts';

test('isPointInElement correctly identifies point inside rectangle and sticky', () => {
  const rect: CanvasElement = {
    id: 'r1',
    type: 'rectangle',
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    color: '#ffffff',
    strokeWidth: 2,
    authorId: 'user-1',
    authorName: 'Tester',
    authorColor: '#00ff00',
    updatedAt: Date.now(),
  };

  // Inside
  assert.equal(isPointInElement({ x: 150, y: 150 }, rect), true);
  // Outside
  assert.equal(isPointInElement({ x: 50, y: 50 }, rect), false);
  assert.equal(isPointInElement({ x: 350, y: 150 }, rect), false);

  const sticky: CanvasElement = {
    id: 's1',
    type: 'sticky',
    x: 400,
    y: 300,
    width: 160,
    height: 140,
    color: '#FEF08A',
    strokeWidth: 1,
    authorId: 'user-1',
    authorName: 'Tester',
    authorColor: '#00ff00',
    updatedAt: Date.now(),
  };

  assert.equal(isPointInElement({ x: 420, y: 320 }, sticky), true);
  assert.equal(isPointInElement({ x: 600, y: 320 }, sticky), false);
});

test('createBotCollaborator generates valid collaborator within bounds', () => {
  const bot = createBotCollaborator(0, { width: 1000, height: 800 });
  assert.equal(bot.isBot, true);
  assert.ok(bot.name.length > 0);
  assert.ok(bot.cursor.x >= 100 && bot.cursor.x <= 900);
  assert.ok(bot.cursor.y >= 100 && bot.cursor.y <= 700);
});
