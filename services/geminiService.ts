import { GoogleGenAI } from "@google/genai";
import { PineScriptParams, GeneratedResult } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- PIPELINE CONSTANTS ---

const INSTITUTIONAL_GUIDELINES = `
ROLE: You are an Elite Quantitative Developer & Institutional Trader (CTA).
YOUR GOAL: Create "Hedge Fund Grade" scripts. Never create "Retail" grade basic scripts unless explicitly asked to keep it simple.

### EXPERT TRADING PHILOSOPHY (AUTO-APPLY THESE):
1.  **Confluence is King**: Never trade on a single signal.
    -   *Implicit Requirement*: If the user asks for "RSI Strategy", AUTOMATICALLY add a Trend Filter (e.g., EMA 200) and a Volatility Filter (e.g., ADX > 20 or ATR check) to filter out noise.
2.  **Risk Management**:
    -   Strategies MUST calculate position size dynamically or use ATR-based Stop Loss / Take Profit (Chandelier Exit logic) rather than fixed percentages.
3.  **Visual Intelligence**:
    -   Always draw a "Status Dashboard" (table) on the chart showing current trend, volatility state, and signal status.
    -   Use professional, soft color palettes (e.g., teal/red with transparency), avoid neon defaults.
4.  **Repainting Protection**:
    -   Strictly forbid 'request.security' lookahead unless using 'barmerge.lookahead_off'.
5.  **User Flexibility**:
    -   Every parameter (Lengths, Sources, Multipliers, Colors, Dashboard location) MUST be an 'input()'.
`;

const QUALITY_CHECKS = `
QUALITY CONTROL PIPELINE (Must pass all):
1. [Syntax Check] Ensure all parentheses and brackets are balanced.
2. [Version Check] Ensure the correct //@version tag (e.g., //@version=6) is the very first line.
3. [Declaration Check] CRITICAL: Scripts must contain EXACTLY ONE declaration statement: "indicator()" OR "strategy()". NEVER use both.
4. [Short Title Check] CRITICAL: The 'shorttitle' argument in the declaration MUST be 10 characters or less (e.g., shorttitle="Pro_RSI").
5. [Repainting Check] If using request.security, ensure lookahead=barmerge.lookahead_on (or handle correctly) to avoid repainting.
6. [Input Check] All adjustable parameters must use input().
7. [Visualization Check] Strategy must have visual debug plots (plotshape for entries/exits).
`;

const SYNTAX_SAFETY_GUARD = `
### SYNTAX SAFETY GUARD (CRITICAL PREVENTIONS):
1. **The '=>' Operator**:
   - **CORRECT USE**: ONLY in function definitions (e.g., \`f() =>\`) and \`switch\` structures.
   - **INCORRECT USE**: NEVER use \`=>\` for variable assignment. Use \`=\` instead.
   - **INCORRECT USE**: Do not use \`=>\` in 'if' statements or loops.
2. **Function Definitions**:
   - Ensure functions defined with \`=>\` have an indented body (4 spaces).
   - Do NOT use the word \`return\`. The last expression in the block is the return value.
3. **Indentation**: Pine Script is strictly whitespace-sensitive. Use 4 spaces for indentation.
4. **Compatibility**: If generating for v6 and you are unsure of a new feature, use standard v5 syntax as it is forward-compatible.
`;

/**
 * Clean and normalize the raw Pine Script code returned by the AI.
 */
const postProcessCode = (rawText: string, version: string): string => {
  let cleanCode = rawText;

  // 1. Extract from Markdown blocks if present
  const codeBlockRegex = /```(?:pinescript|pine|)\s*([\s\S]*?)\s*```/i;
  const match = cleanCode.match(codeBlockRegex);
  if (match) {
    cleanCode = match[1].trim();
  }

  // 2. Ensure Version Tag matches
  const versionNum = version.replace(/[^0-9]/g, '');
  const versionTag = `//@version=${versionNum}`;
  
  // Remove existing version tags to avoid duplicates
  cleanCode = cleanCode.replace(/\/\/@version=\d+\s*/g, '');
  
  // Prepend correct version
  cleanCode = `${versionTag}\n${cleanCode}`;

  // 3. Trim extra newlines
  cleanCode = cleanCode.replace(/\n{3,}/g, '\n\n');

  return cleanCode;
};

export const generatePineScript = async (params: PineScriptParams, onStatusUpdate?: (status: string) => void): Promise<GeneratedResult> => {
  const model = params.model || 'gemini-3-pro-preview';
  const versionNum = params.version.replace(/[^0-9]/g, '');
  
  // Check if we are in "Expert Mode" (Pro model selected)
  const isExpertMode = model.includes('pro');

  // Simulate Pipeline Stages for UI feedback (if callback provided)
  if (onStatusUpdate) onStatusUpdate('NORMALIZING_REQUEST');

  const customContextPrompt = params.customContext 
    ? `
    ### USER KNOWLEDGE BASE (PDF/CUSTOM CONTEXT)
    The user has provided specific rules, logic, or text from a PDF. YOU MUST PRIORITIZE THIS INFORMATION.
    If the PDF context conflicts with "Expert Trading Philosophy", follow the PDF context.
    
    [START OF PDF CONTEXT]
    ${params.customContext}
    [END OF PDF CONTEXT]
    ` 
    : '';

  const systemPrompt = `
    You are "PineArchitect-v5", an Elite Quantitative Developer for TradingView.
    
    Current Task: Generate Production-Ready Pine Script ${params.version}.

    ${isExpertMode ? INSTITUTIONAL_GUIDELINES : ''}

    ${QUALITY_CHECKS}
    
    ${SYNTAX_SAFETY_GUARD}

    ### ARCHITECTURE RULES
    1. **Metadata**: Start with a detailed comment block (Strategy Name, Author, Logic).
    2. **Inputs**: Use grouped inputs (group="Strategy Settings", group="Risk Management", group="UI Settings").
    3. **Date Filter**: For strategies, ALWAYS add a "Backtest Time Period" input group to filter by date.
    4. **Risk Management**:
       - If Strategy: Implement 'strategy.exit' with ATR-based SL/TP inputs.
       - If Indicator: Plot SL/TP levels based on the signal.
    5. **Alerts**: Implement 'alertcondition' for every signal type.
    6. **Style**: Use 'color.new()' for transparency. Use distinct colors for Buy (Green) and Sell (Red).
    7. **Declaration**: Use ONLY '${params.scriptType}' declaration. Ensure 'shorttitle' is <= 10 chars.

    ${customContextPrompt}

    ### OUTPUT FORMAT
    Return a structured response:
    [ANALYSIS]
    Technical summary of the strategy logic. If Knowledge Base was provided, explicitly state how it was used (e.g., "Implemented custom MACD formula from user PDF").
    
    [CODE]
    \`\`\`pinescript
    //@version=${versionNum}
    ${params.scriptType}("Title", shorttitle="Title<10", overlay=${params.overlay})
    ...
    \`\`\`
  `;

  const userPrompt = `
    SCRIPT CONFIGURATION:
    - Type: ${params.scriptType.toUpperCase()}
    - Overlay: ${params.overlay}
    - Mode: ${isExpertMode ? 'INSTITUTIONAL / EXPERT' : 'STANDARD'}

    USER REQUEST:
    "${params.prompt}"

    EXECUTION INSTRUCTIONS:
    1. Analyze the user request.
    ${isExpertMode ? '2. "Pro-Upgrade": Even if the user asked for something simple, wrap it in a professional framework (Dashboard, Trend Filter, ATR Stops) unless they explicitly said "simple" OR unless the PDF Context forbids it.' : '2. Implement the logic as requested.'}
    3. Generate the code following Strict Coding Rules.
    4. Validate against Quality Control Pipeline (Check ShortTitle length & Single Declaration).
  `;

  try {
    // Stage 2: Optimizing
    if (onStatusUpdate) onStatusUpdate('OPTIMIZING_LOGIC');
    
    // Stage 3: Generating
    if (onStatusUpdate) onStatusUpdate('GENERATING_CODE');

    const response = await ai.models.generateContent({
      model: model,
      contents: [
        { role: 'user', parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }
      ],
      config: {
        temperature: 0.1, // Lower temperature to strict syntax adherence
        maxOutputTokens: 65536,
        // Expert mode needs more "thinking" to build the dashboard and complex logic
        thinkingConfig: isExpertMode ? { thinkingBudget: 2048 } : undefined,
      }
    });

    // Stage 4: Validating & Post-processing
    if (onStatusUpdate) onStatusUpdate('VALIDATING_OUTPUT');

    const text = response.text || "";
    
    // Parse
    let code = "";
    let explanation = text;

    const codeBlockMatch = text.match(/```(?:pinescript|pine|)\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
      code = codeBlockMatch[1];
      explanation = text.replace(codeBlockMatch[0], '').trim();
      explanation = explanation.replace(/\[ANALYSIS\]|\[CODE\]/g, '').trim();
    } else {
       // Fallback: Try to find the version tag start
       const versionIdx = text.indexOf('//@version=');
       if (versionIdx !== -1) {
          code = text.substring(versionIdx);
          explanation = text.substring(0, versionIdx);
       } else {
          code = "// Error: Could not parse code block.";
       }
    }

    // Post-Process Pipeline
    const processedCode = postProcessCode(code, params.version);

    return { code: processedCode, explanation };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Pipeline Error: Failed to generate valid script.");
  }
};

/**
 * Refines existing Pine Script code based on user instruction.
 */
export const refinePineScript = async (
  currentCode: string, 
  instruction: string, 
  params: PineScriptParams
): Promise<GeneratedResult> => {
  const model = params.model || 'gemini-3-pro-preview';
  const versionNum = params.version.replace(/[^0-9]/g, '');
  const isExpertMode = model.includes('pro');

  const customContextPrompt = params.customContext 
  ? `
  ### ORIGINAL KNOWLEDGE BASE (CONTEXT)
  The original script was built using these rules. MAINTAIN COMPLIANCE with them unless instructed otherwise:
  ${params.customContext}
  ` 
  : '';

  const systemPrompt = `
    You are a Pine Script Refinement Specialist (Expert Level).
    Your task is to EDIT the provided Pine Script based on the user's instruction.

    ${QUALITY_CHECKS}
    ${isExpertMode ? INSTITUTIONAL_GUIDELINES : ''}
    ${SYNTAX_SAFETY_GUARD}
    ${customContextPrompt}

    ### RULES FOR REFINEMENT (CRITICAL):
    1. **FULL CODE REQUIRED**: You MUST output the ENTIRE script code, from '//@version=' to the last line. 
       - DO NOT output "snippets" or "changed parts only".
       - DO NOT use placeholders like "// ... rest of code ...".
       - The user needs to copy-paste the WHOLE file.
    2. **Maintain Logic**: Keep existing logic unless explicitly asked to change it.
    3. **Compilability**: Ensure the resulting code is valid and compilable.
    4. **Short Titles**: Ensure 'shorttitle' remains <= 10 characters.
    5. **Dashboard**: If the script has a Dashboard/Table, ensure it remains in the code.

    ### OUTPUT FORMAT
    [ANALYSIS]
    Brief summary of changes.
    
    [CODE]
    \`\`\`pinescript
    //@version=${versionNum}
    ... (FULL UPDATED CODE HERE) ...
    \`\`\`
  `;

  const userPrompt = `
    CURRENT CODE:
    \`\`\`pinescript
    ${currentCode}
    \`\`\`

    USER INSTRUCTION:
    "${instruction}"

    Output the [ANALYSIS] and the [CODE] blocks.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: [
        { role: 'user', parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 65536,
        thinkingConfig: isExpertMode ? { thinkingBudget: 1024 } : undefined,
      }
    });

    const text = response.text || "";
    let code = "";
    let explanation = text;

    const codeBlockMatch = text.match(/```(?:pinescript|pine|)\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
      code = codeBlockMatch[1];
      explanation = text.replace(codeBlockMatch[0], '').trim();
      explanation = explanation.replace(/\[ANALYSIS\]|\[CODE\]/g, '').trim();
    } else {
       // Fallback logic if the model fails to use markdown blocks
       const versionIdx = text.indexOf('//@version=');
       if (versionIdx !== -1) {
          code = text.substring(versionIdx);
          explanation = text.substring(0, versionIdx);
       } else {
          // If we fail to parse new code, do NOT return old code silently.
          // Force an error or return a comment indicating failure so the user knows.
          code = currentCode + "\n\n// ERROR: AI failed to generate the updated code block. Please try refining again."; 
          explanation = "I understood your request but failed to generate the full code structure. Please try again.";
       }
    }

    const processedCode = postProcessCode(code, params.version);
    return { code: processedCode, explanation };

  } catch (error) {
    console.error("Gemini API Error (Refine):", error);
    throw new Error("Failed to refine script.");
  }
};

/**
 * Enhances a user's prompt (for generation or refinement) to be more professional and detailed.
 */
export const enhancePrompt = async (
    inputText: string, 
    _model: string // Ignored to force best model for text task
  ): Promise<string> => {
    
    // Switch to PRO for enhancement to ensure high quality and better language understanding
    // Flash was causing issues with nonsensical outputs in non-English contexts.
    const effectiveModel = 'gemini-3-pro-preview'; 

    const systemPrompt = `
      You are a Senior Pine Script Architect assisting a trader.
      Your goal is to refine the user's raw input into a **Structured Requirement Specification** for coding.
      
      CRITICAL RULES:
      1. **Preserve Intent**: Do not change the user's core strategy idea. Only clarify it.
      2. **Structure**: Format the output clearly with headers like "LOGIC:", "CONDITIONS:", "FILTERS:", "VISUALS:".
      3. **Technical Precision**: Replace vague terms with technical Pine Script concepts (e.g., "stop loss" -> "ATR-based Stop Loss or % Trailing Stop").
      4. **Language**: STRICTLY output in the SAME LANGUAGE as the input (Turkish -> Turkish, English -> English).
      5. **No Filler**: Return ONLY the new prompt text. No "Here is the improved version" prefix.
      6. **Don't Over-Engineer**: If the user asks for a simple RSI, keep it simple but precise. Don't add unrelated indicators randomly.
    `;
  
    const userPrompt = `
      RAW INPUT: "${inputText}"
      
      REFINED SPECIFICATION:
    `;
  
    try {
      const response = await ai.models.generateContent({
        model: effectiveModel,
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }
        ],
        config: {
          temperature: 0.3, // Low temperature to keep it grounded but articulate
          maxOutputTokens: 2048,
        }
      });
  
      return response.text?.trim() || inputText;
    } catch (error) {
      console.error("Enhance Prompt Error:", error);
      // Return original text on error so UI doesn't break
      return inputText; 
    }
  };

interface PdfAnalysisResult {
    scriptType: 'strategy' | 'indicator';
    generatedPrompt: string;
    overlay: boolean;
}

/**
 * Reads a PDF file, analyzes it, and returns a structured configuration including the prompt.
 */
export const extractStrategyFromPdf = async (
  pdfBase64: string,
  fileName: string
): Promise<PdfAnalysisResult> => {
  // Use Gemini 3 Flash as it is multimodal, fast, and good at structured extraction
  const model = 'gemini-3-flash-preview';

  const systemPrompt = `
    You are a Financial Document Analyst and Pine Script Architect.
    Your task is to READ the attached PDF document, UNDERSTAND the trading logic, and PREPARE a detailed prompt for a coder.

    TASKS:
    1. **Classify**: Is this described system a 'strategy' (has clear buy/sell execution rules with backtesting intent) or an 'indicator' (visualization only)?
    2. **Overlay**: Should this script be overlaid on the price chart (true) or appear in a separate pane (false)? 
       - Strategies are usually overlay=true.
       - Oscillators (RSI, MACD) are overlay=false.
       - Moving Averages/Bollinger Bands are overlay=true.
    3. **Draft Prompt**: Write a highly detailed, professional prompt that describes exactly how to code this script. 
       - Include all formulas, conditions, inputs, and colors mentioned in the PDF.
       - Do NOT use markdown in the prompt text itself (it will be placed in a text box).

    OUTPUT FORMAT (JSON ONLY):
    {
      "scriptType": "strategy" OR "indicator",
      "overlay": true OR false,
      "generatedPrompt": "Full detailed instruction text here..."
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: [
        { 
            role: 'user', 
            parts: [
                { text: systemPrompt },
                { 
                    inlineData: {
                        mimeType: 'application/pdf',
                        data: pdfBase64 
                    }
                }
            ] 
        }
      ],
      config: {
        temperature: 0.1, 
        maxOutputTokens: 8192,
        responseMimeType: "application/json" 
      }
    });

    const text = response.text || "{}";
    
    // Parse the JSON response
    try {
        const result = JSON.parse(text) as PdfAnalysisResult;
        
        // Fallback validation
        if (!result.scriptType) result.scriptType = 'indicator';
        if (typeof result.overlay !== 'boolean') result.overlay = true;
        if (!result.generatedPrompt) result.generatedPrompt = "Failed to extract prompt from PDF.";
        
        return result;
    } catch (e) {
        console.error("JSON Parse Error:", e);
        return {
            scriptType: 'indicator',
            overlay: true,
            generatedPrompt: "Error parsing PDF analysis. The AI processed the file but returned invalid JSON."
        };
    }

  } catch (error) {
    console.error("PDF Extraction Error:", error);
    throw new Error("Failed to analyze PDF. Please ensure the file is valid.");
  }
};