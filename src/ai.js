const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require('./config');
const sharp = require('sharp');
const pdfParse = require('pdf-parse');

const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const aiOps = {
  classifyMessage: async (message) => {
    const prompt = `Classify the following message into one of these categories: 'greeting', 'fitness_related', 'health_related', or 'off_topic'. Respond with just the category name. Message: "${message}"`;
    const result = await model.generateContent(prompt);
    return result.response.text().trim().toLowerCase();
  },

  generateResponse: async (message, context) => {
    const prompt = `As a knowledgeable fitness coach, provide a helpful and encouraging response to this query. Include relevant advice or information.
                    Previous conversation:
                    ${context.join('\n')}
                    User: ${message}
                    Coach:`;
    const result = await model.generateContent(prompt);
    return result.response.text();
  },

  analyzeImage: async (imageBuffer, mimeType) => {
    try {
      if (mimeType === 'image/png') {
        imageBuffer = await sharp(imageBuffer).jpeg().toBuffer();
      }
      const imageParts = [
        {
          inlineData: {
            data: imageBuffer.toString('base64'),
            mimeType: 'image/jpeg'
          }
        }
      ];
      const result = await model.generateContent(['Analyze this fitness-related image. Describe what you see and provide any relevant fitness insights:', ...imageParts]);
      return result.response.text();
    } catch (error) {
      console.error('Error analyzing image:', error);
      return 'Error analyzing image';
    }
  },

  analyzePDF: async (pdfBuffer) => {
    try {
      const data = await pdfParse(pdfBuffer);
      const text = data.text;
      const result = await model.generateContent(['Summarize this fitness-related PDF content and provide key insights:', text]);
      return result.response.text();
    } catch (error) {
      console.error('Error analyzing PDF:', error);
      return 'Error analyzing PDF';
    }
  },

  summarizeChat: async (messages) => {
    const prompt = `Summarize the following fitness-related chat conversation, highlighting key points and advice given:\n\n${messages.join('\n')}`;
    const result = await model.generateContent(prompt);
    return result.response.text();
  },

  generateUserWeeklySummary: async (messages) => {
    const prompt = `Generate a weekly fitness summary report based on the following user messages. Include key achievements, areas for improvement, and personalized recommendations:\n\n${messages.join('\n')}`;
    const result = await model.generateContent(prompt);
    return result.response.text();
  }
};

module.exports = aiOps;