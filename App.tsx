import React, { useState, useEffect, useRef } from 'react';
import { PineScriptParams, LoadingState, GeneratedResult, ChatMessage } from './types';
import { generatePineScript, refinePineScript, enhancePrompt, extractStrategyFromPdf } from './services/geminiService';
import { SparklesIcon, CopyIcon, CheckIcon, CodeIcon, TerminalIcon, RefreshIcon, SendIcon, LightbulbIcon, MagicWandIcon, BookIcon, UploadIcon, FileTextIcon, TrashIcon } from './components/Icons';

// Pre-defined expert prompt templates
const EXAMPLE_PROMPTS = [
  {
    label: "Trend Following (Golden Cross)",
    type: "strategy",
    description: "Classic SMA crossover with volatility filter & risk management",
    text: "Create a Strategy. Enter Long when SMA 50 crosses above SMA 200. \n\nFILTERS:\n1. Only trade if price is above EMA 200 (Trend Filter).\n2. Only trade if ADX > 25 (Volatility Filter).\n\nRISK MANAGEMENT:\n- Use ATR-based Stop Loss (1.5x) and Take Profit (3x).\n- Add a visual Dashboard table showing Trend and ADX status."
  },
  {
    label: "RSI Mean Reversion",
    type: "strategy",
    description: "Counter-trend strategy buying oversold dips",
    text: "Create a Mean Reversion Strategy. \n\nLOGIC:\n- Buy when RSI (14) crosses under 30.\n- Sell when RSI crosses over 70.\n\nADVANCED:\n- Use a dynamic position size based on 1% risk per trade.\n- Plot the Buy/Sell signals clearly on the chart.\n- Add date range filtering for backtesting."
  },
  {
    label: "Multi-Timeframe Dashboard",
    type: "indicator",
    description: "Scanner for RSI status across 3 timeframes",
    text: "Create a Dashboard Indicator (non-overlay).\n\nDisplay a table in the top-right corner showing RSI (14) values for:\n1. Current Timeframe\n2. 4-Hour Timeframe\n3. Daily Timeframe\n\nColor the cell Green if RSI < 30 (Oversold) and Red if RSI > 70 (Overbought). Otherwise Gray."
  },
  {
    label: "Volume Breakout",
    type: "strategy",
    description: "Price action + Volume spike detection",
    text: "Create a Breakout Strategy.\n\nCONDITIONS:\n- Buy when Close is higher than the highest high of the last 20 bars.\n- AND Volume is 200% higher than the SMA(20) of volume.\n\nEXIT:\n- Trailing Stop of 2%.\n- Add an alertcondition for the breakout."
  }
];

const App: React.FC = () => {
  // State
  const [params, setParams] = useState<PineScriptParams>({
    prompt: '',
    scriptType: 'indicator',
    overlay: true,
    version: 'v6', // Updated default to v6
    model: 'gemini-3-pro-preview',
    customContext: ''
  });
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  
  // PDF Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzingPdf, setIsAnalyzingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, loadingState]);

  // Handlers
  const handleGenerate = async () => {
    if (!params.prompt.trim()) return;

    setLoadingState(LoadingState.NORMALIZING); // Start with first stage
    setErrorMsg(null);
    setResult(null);
    setChatMessages([]); // Reset chat on new generation

    try {
      const updateStatus = (status: string) => {
          switch(status) {
              case 'NORMALIZING_REQUEST': setLoadingState(LoadingState.NORMALIZING); break;
              case 'OPTIMIZING_LOGIC': setLoadingState(LoadingState.OPTIMIZING); break;
              case 'GENERATING_CODE': setLoadingState(LoadingState.GENERATING); break;
              case 'VALIDATING_OUTPUT': setLoadingState(LoadingState.VALIDATING); break;
          }
      };

      const data = await generatePineScript(params, updateStatus);
      setResult(data);
      // Add initial AI explanation to chat
      setChatMessages([{ role: 'model', content: data.explanation }]);
      setLoadingState(LoadingState.SUCCESS);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during generation.');
      setLoadingState(LoadingState.ERROR);
    }
  };

  const handleRefine = async () => {
    if (!chatInput.trim() || !result) return;

    const userMsg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoadingState(LoadingState.REFINING);

    try {
      const data = await refinePineScript(result.code, userMsg, params);
      setResult(data); // Update code
      setChatMessages(prev => [...prev, { role: 'model', content: data.explanation }]);
      setLoadingState(LoadingState.SUCCESS);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'model', content: "Error: Failed to refine code. Please try again." }]);
      setLoadingState(LoadingState.SUCCESS); // Back to success state to allow retry
    }
  };

  const handleEnhanceMain = async () => {
      if (!params.prompt.trim() || isEnhancing) return;
      setIsEnhancing(true);
      setErrorMsg(null); // Clear previous errors
      try {
          const enhanced = await enhancePrompt(params.prompt, params.model);
          setParams(prev => ({ ...prev, prompt: enhanced }));
      } catch (e: any) {
          console.error(e);
          setErrorMsg("Enhancement failed. Please try again.");
      } finally {
          setIsEnhancing(false);
      }
  };

  const handleEnhanceChat = async () => {
      if (!chatInput.trim() || isEnhancing) return;
      setIsEnhancing(true);
      try {
          const enhanced = await enhancePrompt(chatInput, params.model);
          setChatInput(enhanced);
      } catch (e) {
          console.error(e);
          // Silent fail for chat enhancement, just don't update text
      } finally {
          setIsEnhancing(false);
      }
  };

  // PDF Handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') {
        setErrorMsg("Please select a valid PDF file.");
        return;
      }
      setSelectedFile(file);
      setErrorMsg(null);
    }
  };

  const handleAnalyzePdf = async () => {
    if (!selectedFile || isAnalyzingPdf) return;

    setIsAnalyzingPdf(true);
    setErrorMsg(null);

    try {
      // Convert file to Base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
           // Remove data:application/pdf;base64, prefix
           const result = reader.result as string;
           const base64 = result.split(',')[1];
           resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      // Now returns a structured object
      const analysisResult = await extractStrategyFromPdf(base64Data, selectedFile.name);
      
      // Update UI with the extracted data
      setParams(prev => ({
        ...prev,
        // The main requirement: Write as prompt
        prompt: analysisResult.generatedPrompt,
        // Auto-configure types
        scriptType: analysisResult.scriptType,
        overlay: analysisResult.overlay,
        // Optional: Keep a copy in customContext if user wants to see the source, 
        // or clear it to avoid confusion since it's now in the prompt.
        // Let's populate it just in case generation needs context fallback.
        customContext: `[Source PDF Analysis]: ${analysisResult.generatedPrompt}`
      }));

      // Automatically show the prompt area to the user if they were in the KB section
      // (State update will trigger re-render)

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to analyze PDF.");
    } finally {
      setIsAnalyzingPdf(false);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCopy = () => {
    if (result?.code) {
      navigator.clipboard.writeText(result.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClear = () => {
    setParams(prev => ({ ...prev, prompt: '', customContext: '' }));
    setResult(null);
    setChatMessages([]);
    setLoadingState(LoadingState.IDLE);
    handleClearFile();
  };

  const handleLoadTemplate = (template: typeof EXAMPLE_PROMPTS[0]) => {
    setParams(prev => ({
      ...prev,
      prompt: template.text,
      scriptType: template.type as 'indicator' | 'strategy',
      // Auto-set overlay based on logical assumption, though user can change
      overlay: template.text.includes("Overlay") || template.type === 'strategy'
    }));
  };

  // Helper to get loading text
  const getLoadingText = () => {
      switch (loadingState) {
          case LoadingState.NORMALIZING: return 'Normalizing Request...';
          case LoadingState.OPTIMIZING: return 'Optimizing Logic & Defaults...';
          case LoadingState.GENERATING: return 'Writing Pine Script...';
          case LoadingState.VALIDATING: return 'Validating & Post-processing...';
          case LoadingState.REFINING: return 'Refining Code...';
          default: return 'Processing...';
      }
  };

  const isGenerating = loadingState !== LoadingState.IDLE && loadingState !== LoadingState.SUCCESS && loadingState !== LoadingState.ERROR && loadingState !== LoadingState.REFINING;

  return (
    <div className="min-h-screen bg-trading-dark text-trading-text font-sans selection:bg-trading-green selection:text-white flex flex-col">
      
      {/* Header */}
      <header className="border-b border-trading-hover bg-trading-panel sticky top-0 z-10 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-trading-green to-emerald-700 rounded-lg">
               <TerminalIcon className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              PineScript <span className="text-trading-green">Architect</span>
            </h1>
          </div>
          <div className="hidden sm:flex items-center text-sm text-gray-400 space-x-4">
             <span>Powered by Gemini 3</span>
             <div className="h-4 w-px bg-gray-600"></div>
             <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> v1.2.0 (Pine v6)</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 gap-6 grid grid-cols-1 lg:grid-cols-2">
        
        {/* Left Column: Input & Controls */}
        <section className="flex flex-col space-y-6">
          
          {/* Controls Panel */}
          <div className="bg-trading-panel rounded-xl border border-trading-hover p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
               <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                 <CodeIcon className="w-5 h-5 text-trading-green" />
                 Configuration
               </h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                  Script Type
                </label>
                <div className="flex bg-trading-dark rounded-lg p-1 border border-trading-hover">
                  <button
                    onClick={() => setParams({ ...params, scriptType: 'indicator' })}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                      params.scriptType === 'indicator' 
                        ? 'bg-trading-panel text-trading-green shadow-sm' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Indicator
                  </button>
                  <button
                    onClick={() => setParams({ ...params, scriptType: 'strategy' })}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                      params.scriptType === 'strategy' 
                        ? 'bg-trading-panel text-trading-green shadow-sm' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Strategy
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                  Overlay
                </label>
                <div className="flex bg-trading-dark rounded-lg p-1 border border-trading-hover">
                   <button
                    onClick={() => setParams({ ...params, overlay: true })}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                      params.overlay 
                        ? 'bg-trading-panel text-trading-green shadow-sm' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setParams({ ...params, overlay: false })}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                      !params.overlay 
                        ? 'bg-trading-panel text-trading-green shadow-sm' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                  Version
                </label>
                <div className="flex bg-trading-dark rounded-lg p-1 border border-trading-hover">
                   <button
                    onClick={() => setParams({ ...params, version: 'v6' })}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                      params.version === 'v6'
                        ? 'bg-trading-panel text-trading-green shadow-sm' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    v6
                  </button>
                  <button
                    onClick={() => setParams({ ...params, version: 'v5' })}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                      params.version === 'v5'
                        ? 'bg-trading-panel text-trading-green shadow-sm' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    v5
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                  AI Model
                </label>
                <div className="flex bg-trading-dark rounded-lg p-1 border border-trading-hover">
                   <button
                    onClick={() => setParams({ ...params, model: 'gemini-3-pro-preview' })}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                      params.model === 'gemini-3-pro-preview'
                        ? 'bg-trading-panel text-trading-green shadow-sm' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                    title="Best for complex logic and reasoning"
                  >
                    Pro (Quality)
                  </button>
                  <button
                    onClick={() => setParams({ ...params, model: 'gemini-3-flash-preview' })}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                      params.model === 'gemini-3-flash-preview'
                        ? 'bg-trading-panel text-trading-green shadow-sm' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                    title="Faster generation, good for simpler scripts"
                  >
                    Flash (Speed)
                  </button>
                </div>
              </div>
            </div>

            {/* Knowledge Base Toggle & PDF Upload */}
            <div className="mb-4">
              <button 
                onClick={() => setShowKnowledgeBase(!showKnowledgeBase)}
                className="w-full flex items-center justify-between p-2 bg-trading-dark border border-trading-hover rounded-lg text-sm font-medium text-gray-300 hover:bg-trading-hover transition-colors"
              >
                 <span className="flex items-center gap-2">
                   <BookIcon className="w-4 h-4 text-orange-400" />
                   Knowledge Base (PDF / Custom Context)
                 </span>
                 <span className={`transform transition-transform ${showKnowledgeBase ? 'rotate-180' : ''}`}>▼</span>
              </button>
              
              {showKnowledgeBase && (
                <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200 space-y-3">
                  {/* PDF Upload Area */}
                  <div className="bg-trading-dark p-3 rounded-lg border border-dashed border-gray-600 flex flex-col items-center gap-2">
                     <input 
                       type="file" 
                       accept=".pdf" 
                       onChange={handleFileSelect} 
                       ref={fileInputRef}
                       className="hidden" 
                       id="pdf-upload"
                     />
                     {!selectedFile ? (
                        <label 
                          htmlFor="pdf-upload" 
                          className="cursor-pointer flex flex-col items-center gap-1 text-gray-400 hover:text-trading-green transition-colors"
                        >
                          <UploadIcon className="w-8 h-8 opacity-50" />
                          <span className="text-xs">Click to upload Strategy PDF</span>
                        </label>
                     ) : (
                        <div className="w-full flex items-center justify-between bg-trading-panel p-2 rounded">
                           <div className="flex items-center gap-2 overflow-hidden">
                              <FileTextIcon className="w-4 h-4 text-red-400 flex-shrink-0" />
                              <span className="text-xs text-gray-200 truncate">{selectedFile.name}</span>
                           </div>
                           <button onClick={handleClearFile} className="text-gray-500 hover:text-red-400 p-1">
                              <TrashIcon className="w-3 h-3" />
                           </button>
                        </div>
                     )}

                     {selectedFile && (
                        <button
                          onClick={handleAnalyzePdf}
                          disabled={isAnalyzingPdf}
                          className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded font-medium disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                        >
                           {isAnalyzingPdf ? (
                             <>
                               <RefreshIcon className="w-3 h-3 animate-spin" />
                               Analyzing PDF...
                             </>
                           ) : (
                             <>
                               <SparklesIcon className="w-3 h-3" />
                               Analyze & Extract Strategy
                             </>
                           )}
                        </button>
                     )}
                  </div>

                  <textarea
                    value={params.customContext}
                    onChange={(e) => setParams({ ...params, customContext: e.target.value })}
                    placeholder="Extracted PDF strategy rules will appear here. You can also edit this text manually."
                    className="w-full h-32 bg-trading-dark text-gray-300 p-3 rounded-lg border border-trading-hover focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none resize-y font-mono text-xs"
                  />
                </div>
              )}
            </div>

            <div className="relative">
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex justify-between">
                <span>Strategy Logic / Description</span>
                <span className="text-xs text-gray-600 normal-case">English or Turkish accepted</span>
              </label>
              <textarea
                value={params.prompt}
                onChange={(e) => setParams({ ...params, prompt: e.target.value })}
                placeholder="Describe your strategy logic here... 
Example: Create an RSI strategy that buys when RSI < 30 and sells when RSI > 70. Use a 14 period length."
                className="w-full h-48 bg-trading-dark text-gray-200 p-4 pb-12 rounded-lg border border-trading-hover focus:border-trading-green focus:ring-1 focus:ring-trading-green outline-none resize-none font-mono text-sm leading-relaxed"
              />
              
              {/* Main Enhance Button */}
              {params.prompt && (
                <button
                   onClick={handleEnhanceMain}
                   disabled={isEnhancing}
                   className="absolute bottom-4 left-4 text-xs flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-3 py-1.5 rounded transition-all shadow-md active:scale-95 disabled:opacity-50"
                   title="Improve prompt with AI"
                >
                   <MagicWandIcon className={`w-3.5 h-3.5 ${isEnhancing ? 'animate-spin' : ''}`} />
                   {isEnhancing ? 'Enhancing...' : 'Enhance Prompt'}
                </button>
              )}

              {params.prompt && (
                 <button 
                  onClick={handleClear}
                  className="absolute bottom-4 right-4 text-xs text-gray-500 hover:text-white flex items-center gap-1 bg-trading-panel/80 px-2 py-1 rounded transition-colors"
                 >
                   Clear
                 </button>
              )}
            </div>
            
            <div className="mt-6">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !params.prompt.trim()}
                className={`w-full py-3.5 px-4 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-all transform active:scale-95 shadow-lg
                  ${isGenerating
                    ? 'bg-gray-700 cursor-not-allowed opacity-75' 
                    : 'bg-trading-green hover:bg-teal-600 hover:shadow-trading-green/20'
                  }`}
              >
                {isGenerating ? (
                  <>
                    <RefreshIcon className="animate-spin w-5 h-5" />
                    {getLoadingText()}
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-5 h-5" />
                    Generate Script
                  </>
                )}
              </button>
            </div>
          </div>
          
          {/* Templates Section */}
          <div className="bg-trading-panel rounded-xl border border-trading-hover overflow-hidden">
             <div className="px-6 py-4 border-b border-trading-hover bg-gradient-to-r from-trading-panel to-trading-dark">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <LightbulbIcon className="w-4 h-4 text-yellow-400" />
                  Quick Start Templates
                </h3>
             </div>
             <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
               {EXAMPLE_PROMPTS.map((template, idx) => (
                 <button
                    key={idx}
                    onClick={() => handleLoadTemplate(template)}
                    className="group text-left p-3 rounded-lg bg-trading-dark border border-trading-hover hover:border-trading-green/50 hover:bg-[#1a202c] transition-all"
                 >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-gray-300 group-hover:text-white">{template.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${
                        template.type === 'strategy' ? 'bg-purple-900/40 text-purple-300' : 'bg-blue-900/40 text-blue-300'
                      }`}>
                        {template.type}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed">
                      {template.description}
                    </p>
                 </button>
               ))}
             </div>
          </div>

        </section>

        {/* Right Column: Output & Chat */}
        <section className="flex flex-col h-[800px] lg:h-auto">
          <div className="flex-1 bg-trading-panel rounded-xl border border-trading-hover overflow-hidden flex flex-col shadow-xl">
            
            {/* Output Header */}
            <div className="px-4 py-3 border-b border-trading-hover bg-trading-dark/50 flex items-center justify-between shrink-0">
              <span className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                Pine Script {params.version} Output
              </span>
              <div className="flex items-center gap-2">
                {result && (
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-trading-hover hover:bg-gray-700 rounded-md text-xs font-medium text-gray-300 transition-colors"
                  >
                    {copied ? <CheckIcon className="w-3.5 h-3.5 text-green-400" /> : <CopyIcon className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy Code'}
                  </button>
                )}
              </div>
            </div>

            {/* Editor Area (Top Part) */}
            <div className="flex-1 relative bg-[#131722] overflow-hidden flex flex-col border-b border-trading-hover">
               {isGenerating ? (
                 <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 space-y-4">
                   <div className="w-16 h-16 border-4 border-trading-green/20 border-t-trading-green rounded-full animate-spin"></div>
                   <p className="animate-pulse text-sm font-mono tracking-wider">{getLoadingText()}</p>
                 </div>
               ) : errorMsg ? (
                  <div className="p-8 text-center text-red-400">
                    <p className="mb-2 font-bold">Error</p>
                    <p className="text-sm opacity-80">{errorMsg}</p>
                  </div>
               ) : result ? (
                 <div className="absolute inset-0 overflow-auto">
                   <pre className="p-6 font-mono text-sm leading-relaxed">
                     <code className="block text-blue-100 whitespace-pre">
                       {result.code}
                     </code>
                   </pre>
                 </div>
               ) : (
                 <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 select-none">
                    <CodeIcon className="w-12 h-12 mb-4 opacity-20" />
                    <p className="text-sm">Your generated code will appear here.</p>
                 </div>
               )}
            </div>

            {/* Chat/Refinement Area (Bottom Part) */}
            <div className="h-[350px] bg-trading-dark flex flex-col">
              <div className="px-4 py-2 border-b border-trading-hover bg-trading-panel/50 text-xs font-bold text-gray-400 uppercase tracking-wider">
                Refinement Chat
              </div>
              
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                 {chatMessages.length === 0 ? (
                    <div className="text-center text-gray-600 mt-8 text-sm italic">
                      Generate a script to start refining it.
                    </div>
                 ) : (
                   chatMessages.map((msg, idx) => (
                     <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap ${
                          msg.role === 'user' 
                            ? 'bg-trading-green text-white rounded-br-none' 
                            : 'bg-trading-hover text-gray-300 rounded-bl-none border border-white/5'
                        }`}>
                          {msg.role === 'model' && idx === 0 ? (
                             <span className="block font-bold mb-1 text-xs opacity-70 border-b border-white/10 pb-1">AI Analysis</span>
                          ) : null}
                          {msg.content}
                        </div>
                     </div>
                   ))
                 )}
                 {loadingState === LoadingState.REFINING && (
                    <div className="flex justify-start">
                       <div className="bg-trading-hover text-gray-400 rounded-lg rounded-bl-none px-4 py-2 text-sm flex items-center gap-2">
                          <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></span>
                          <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-75"></span>
                          <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-150"></span>
                       </div>
                    </div>
                 )}
                 <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-3 border-t border-trading-hover bg-trading-panel/30">
                 <div className="relative flex items-center gap-2">
                   <input 
                     type="text"
                     value={chatInput}
                     onChange={(e) => setChatInput(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                     placeholder={result ? "Type changes here (e.g., 'Change RSI to 14', 'Add alerts')..." : "Generate code first..."}
                     disabled={!result || loadingState === LoadingState.REFINING}
                     className="flex-1 bg-trading-dark border border-trading-hover text-gray-200 text-sm rounded-lg pl-4 pr-10 py-3 focus:border-trading-green focus:ring-1 focus:ring-trading-green outline-none disabled:opacity-50"
                   />
                   
                   {/* Enhance Button for Chat */}
                   {result && chatInput.trim() && (
                      <button
                        onClick={handleEnhanceChat}
                        disabled={isEnhancing || loadingState === LoadingState.REFINING}
                        className="absolute right-14 text-purple-400 hover:text-purple-300 p-2 rounded transition-colors"
                        title="Enhance message"
                      >
                         <MagicWandIcon className={`w-4 h-4 ${isEnhancing ? 'animate-spin' : ''}`} />
                      </button>
                   )}

                   <button
                     onClick={handleRefine}
                     disabled={!result || loadingState === LoadingState.REFINING || !chatInput.trim()}
                     className="p-3 bg-trading-green hover:bg-teal-600 text-white rounded-lg disabled:opacity-50 disabled:bg-gray-700 transition-colors"
                   >
                     <SendIcon className="w-4 h-4" />
                   </button>
                 </div>
              </div>
            </div>

          </div>
        </section>
      </main>

    </div>
  );
};

export default App;