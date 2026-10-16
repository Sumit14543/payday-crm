const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const healthController = require('../controllers/healthController');

const router = express.Router();

router.get('/', asyncHandler(healthController.getHealth));

module.exports = router;
