import { DebugSession, Response, Scope, Source, StackFrame, Thread } from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import { CustomDebugRuntime } from "./customDebugRuntime";
import { GetBreakpointTypesResponse } from "./dapExtension";
import { Location } from "./lrp";
import { AST_ROOT_VARIABLES_REFERENCE, RUNTIME_STATE_ROOT_VARIABLES_REFERENCE } from "./variableHandler";


export interface CustomLaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    /** Source file for which to launch execution. */
    sourceFile: string;

    /** Port on which the language runtime associated to the source file is listening. */
    languageRuntimePort: number;

    /** True if the program should stop before executing the first step. */
    pauseOnStart?: boolean;

    /** Enabled breakpoint types at the start of execution. */
    enabledBreakpointTypeIds?: string[],

    /** Additional arguments that may be required for specific languages. */
    additionalArgs?: any;
}


/**
 * Handles DAP requests for a specific source file.
 * 
 * Custom error codes:
 * - 100: not implemented
 * - 200: debug session not initialized
 * - 201: debug session already initialized
 */
export class CustomDebugSession extends DebugSession {

    // we don't support multiple threads, so we can use a hardcoded ID for the default thread
    static readonly threadID: number = 1;

    private isInitialized: boolean = false;
    private runtime: CustomDebugRuntime;
    private initializeArgs: DebugProtocol.InitializeRequestArguments;

    /**
     * 
     * @param request 
     */
    protected dispatchRequest(request: DebugProtocol.Request): void {
        const response = new Response(request);

        // Check that the server is initialized
        if (!this.isInitialized && request.command !== 'initialize') {
            this.sendErrorResponse(response, {
                id: 200, format: '{_exception}', variables: {
                    _exception: 'The debug adapter is not yet initialized.'
                }
            });

            return;
        }

        super.dispatchRequest(request);
    }

    /**
     * The initialize request is sent as the first request from the client to the debug adapter in order to configure it with client capabilities and to retrieve capabilities from the debug adapter.
     * Until the debug adapter has responded with an initialize response, the client must not send any additional requests or events to the debug adapter.
     * In addition the debug adapter is not allowed to send any requests or events to the client until it has responded with an initialize response.
     * The initialize request may only be sent once.
     * 
     * @param response 
     * @param args 
     */
    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        if (this.isInitialized) {
            this.sendErrorResponse(response, {
                id: 201, format: '{_exception}', variables: {
                    _exception: 'The debug adapter is already initialized.'
                }
            });
            return;
        }

        this.initializeArgs = args;

        response.body = {};

        // This default debug adapter supports conditional breakpoints.
        response.body.supportsConditionalBreakpoints = true;

        /** The debug adapter does not support the 'breakpointLocations' request. */
        response.body.supportsBreakpointLocationsRequest = false;
        // This default debug adapter does not support hit conditional breakpoints.
        response.body.supportsHitConditionalBreakpoints = false;
        // This default debug adapter does not support function breakpoints.
        response.body.supportsFunctionBreakpoints = false;
        // This default debug adapter implements the 'configurationDone' request.
        response.body.supportsConfigurationDoneRequest = true;
        // This default debug adapter does not support hovers based on the 'evaluate' request.
        response.body.supportsEvaluateForHovers = false;
        // This default debug adapter does not support the 'stepBack' request.
        response.body.supportsStepBack = false;
        // This default debug adapter does not support the 'setVariable' request.
        response.body.supportsSetVariable = false;
        // This default debug adapter does not support the 'restartFrame' request.
        response.body.supportsRestartFrame = false;
        // This default debug adapter does not support the 'stepInTargets' request.
        response.body.supportsStepInTargetsRequest = false;
        // This default debug adapter does not support the 'gotoTargets' request.
        response.body.supportsGotoTargetsRequest = false;
        // This default debug adapter does not support the 'completions' request.
        response.body.supportsCompletionsRequest = false;
        // This default debug adapter does not support the 'restart' request.
        response.body.supportsRestartRequest = false;
        // This default debug adapter does not support the 'exceptionOptions' attribute on the 'setExceptionBreakpoints' request.
        response.body.supportsExceptionOptions = false;
        // This default debug adapter does not support the 'format' attribute on the 'variables', 'evaluate', and 'stackTrace' request.
        response.body.supportsValueFormattingOptions = false;
        // This debug adapter does not support the 'exceptionInfo' request.
        response.body.supportsExceptionInfoRequest = false;
        // This debug adapter does not support the 'TerminateDebuggee' attribute on the 'disconnect' request.
        response.body.supportTerminateDebuggee = false;
        // This debug adapter does not support delayed loading of stack frames.
        response.body.supportsDelayedStackTraceLoading = false;
        // This debug adapter does not support the 'loadedSources' request.
        response.body.supportsLoadedSourcesRequest = false;
        // This debug adapter does not support the 'logMessage' attribute of the SourceBreakpoint.
        response.body.supportsLogPoints = false;
        // This debug adapter does not support the 'terminateThreads' request.
        response.body.supportsTerminateThreadsRequest = false;
        // This debug adapter does not support the 'setExpression' request.
        response.body.supportsSetExpression = false;
        // This debug adapter does not support the 'terminate' request.
        response.body.supportsTerminateRequest = false;
        // This debug adapter does not support data breakpoints.
        response.body.supportsDataBreakpoints = false;
        /** This debug adapter does not support the 'readMemory' request. */
        response.body.supportsReadMemoryRequest = false;
        /** The debug adapter does not support the 'disassemble' request. */
        response.body.supportsDisassembleRequest = false;
        /** The debug adapter does not support the 'cancel' request. */
        response.body.supportsCancelRequest = false;
        /** The debug adapter does not support the 'clipboard' context value in the 'evaluate' request. */
        response.body.supportsClipboardContext = false;
        /** The debug adapter does not support stepping granularities for the stepping requests. */
        response.body.supportsSteppingGranularity = false;
        /** The debug adapter does not support the 'setInstructionBreakpoints' request. */
        response.body.supportsInstructionBreakpoints = false;
        /** The debug adapter does not support 'filterOptions' on the 'setExceptionBreakpoints' request. */
        response.body.supportsExceptionFilterOptions = false;

        this.sendResponse(response);
        this.sendEvent({
            event: 'initialized', seq: 1, type: 'event'
        });

        this.isInitialized = true;
    }

    /**
     * The attach request is sent from the client to the debug adapter to attach to a debuggee that is already running.
     * Since attaching is debugger/runtime specific, the arguments for this request are not part of this specification.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected attachRequest(response: DebugProtocol.AttachResponse, args: DebugProtocol.AttachRequestArguments, request?: DebugProtocol.Request | undefined): void {
        this.sendErrorResponse(response, {
            id: 100, format: '{_exception}', variables: {
                _exception: 'Method attachRequest not implemented.'
            }
        });
    }

    /**
     * The disconnect request asks the debug adapter to disconnect from the debuggee (thus ending the debug session) and then to shut down itself (the debug adapter).
     * In addition, the debug adapter must terminate the debuggee if it was started with the launch request. If an attach request was used to connect to the debuggee, then the debug adapter must not terminate the debuggee.
     * This implicit behavior of when to terminate the debuggee can be overridden with the terminateDebuggee argument (which is only supported by a debug adapter if the corresponding capability supportTerminateDebuggee is true).
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request | undefined): void {
        super.disconnectRequest(response, args, request);
        if (!(this._isServer || this._isRunningInline())) {
            console.error(">> shutting down");
        }
    }

    /**
     * The request retrieves a list of all threads.
     * 
     * @param response 
     * @param request 
     */
    protected async threadsRequest(response: DebugProtocol.ThreadsResponse, request?: DebugProtocol.Request | undefined): Promise<void> {
        // runtime supports a unique thread so just return a default thread.
        response.body = {
            threads: [
                new Thread(CustomDebugSession.threadID, "Unique Thread")]
        };

        this.sendResponse(response);
    }

    /**
     * This launch request is sent from the client to the debug adapter to start the debuggee with or without debugging (if noDebug is true).
     * Since launching is debugger/runtime specific, the arguments for this request are not part of this specification.
     * 
     * @param response 
     * @param args
     * @param request 
     */
    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: CustomLaunchRequestArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        this.runtime = new CustomDebugRuntime(this, args.languageRuntimePort);
        await this.runtime.initExecution(args.sourceFile, args.noDebug ? args.noDebug : false, args.additionalArgs);
        this.runtime.breakpointManager.setFormat(this.initializeArgs.linesStartAt1 == undefined ? true : this.initializeArgs.linesStartAt1, this.initializeArgs.columnsStartAt1 == undefined ? true : this.initializeArgs.columnsStartAt1);

        if (args.enabledBreakpointTypeIds) this.runtime.breakpointManager.enableBreakpointTypes(args.enabledBreakpointTypeIds);

        if (!args.pauseOnStart) this.runtime.run();

        this.sendResponse(response);

        if (args.pauseOnStart) {
            // seq and type don't matter, they're changed inside sendEvent()
            this.sendEvent({
                event: 'stopped', seq: 1, type: 'event', body: {
                    reason: 'entry',
                    threadId: CustomDebugSession.threadID
                }
            });
        }
    }

    /**
     * The request retrieves the source code for a given source reference.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected sourceRequest(response: DebugProtocol.SourceResponse, args: DebugProtocol.SourceArguments, request?: DebugProtocol.Request | undefined): void {
        this.sendErrorResponse(response, {
            id: 100, format: '{_exception}', variables: {
                _exception: 'Method sourceRequest not implemented.'
            }
        });
    }

    /**
     * The request suspends the debuggee.
     * The debug adapter first sends the response and then a stopped event (with reason pause) after the thread has been paused successfully.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments, request?: DebugProtocol.Request | undefined): void {
        this.sendErrorResponse(response, {
            id: 100, format: '{_exception}', variables: {
                _exception: 'Runtime doesn\'t correspond to the source file.'
            }
        });
    }

    /**
     * The request executes one step (in the given granularity) for the specified thread and allows all other threads to run freely by resuming them.
     * If the debug adapter supports single thread execution (see capability supportsSingleThreadExecutionRequests), setting the singleThread argument to true prevents other suspended threads from resuming.
     * The debug adapter first sends the response and then a stopped event (with reason step) after the step has completed.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        this.sendResponse(response);

        await this.performStepAction(this.runtime.nextStep);
    }

    /**
     * The request resumes execution of all threads. If the debug adapter supports single thread execution (see capability supportsSingleThreadExecutionRequests), setting the singleThread argument to true resumes only the specified thread. If not all threads were resumed, the allThreadsContinued attribute of the response should be set to false.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments, request?: DebugProtocol.Request | undefined): void {
        this.sendResponse(response);

        // ignore args.threadID since we only use a unique thread
        this.runtime.run();
    }

    /**
     * Sets multiple breakpoints for a single source and clears all previous breakpoints in that source.
     * To clear all breakpoint for a source, specify an empty array.
     * When a breakpoint is hit, a stopped event (with reason breakpoint) is generated.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        // TODO: fix conflicting calls during initialization
        while (!this.runtime || !this.runtime.breakpointManager) await new Promise<void>(resolve => setTimeout(() => {
            resolve()
        }, 200));

        const breakpoints: DebugProtocol.Breakpoint[] = this.runtime.breakpointManager.setBreakpoints(args.breakpoints!);

        response.body = {
            breakpoints: breakpoints
        }

        this.sendResponse(response);
    }

    /**
     * Evaluates the given expression in the context of the topmost stack frame.
     * The expression has access to any variables and arguments that are in scope.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments, request?: DebugProtocol.Request | undefined): void {
        this.sendErrorResponse(response, {
            id: 100, format: '{_exception}', variables: {
                _exception: 'Method not implemented.'
            }
        });
    }

    /**
     * The request resumes the given thread to step into a function/method and allows all other threads to run freely by resuming them.
     * If the debug adapter supports single thread execution (see capability supportsSingleThreadExecutionRequests), setting the singleThread argument to true prevents other suspended threads from resuming.
     * If the request cannot step into a target, stepIn behaves like the next request.
     * The debug adapter first sends the response and then a stopped event (with reason step) after the step has completed.
     * If there are multiple function/method calls (or other targets) on the source line, the argument targetId can be used to control into which target the stepIn should occur.
     * The list of possible targets for a given source line can be retrieved via the stepInTargets request.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected async stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        this.sendResponse(response);

        await this.performStepAction(this.runtime.nextStep);
    }

    /**
     * The request resumes the given thread to step out (return) from a function/method and allows all other threads to run freely by resuming them.
     * If the debug adapter supports single thread execution (see capability supportsSingleThreadExecutionRequests), setting the singleThread argument to true prevents other suspended threads from resuming.
     * The debug adapter first sends the response and then a stopped event (with reason step) after the step has completed.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected async stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        this.sendResponse(response);

        await this.performStepAction(this.runtime.nextStep);
    }

    /**
     * The request returns a stacktrace from the current execution state of a given thread.
     * A client can request all stack frames by omitting the startFrame and levels arguments. For performance-conscious clients and if the corresponding capability supportsDelayedStackTraceLoading is true, stack frames can be retrieved in a piecemeal way with the startFrame and levels arguments. The response of the stackTrace request may contain a totalFrames property that hints at the total number of frames in the stack. If a client needs this total number upfront, it can issue a request for a single (first) frame and depending on the value of totalFrames decide how to proceed. In any case a client should be prepared to receive fewer frames than requested, which is an indication that the end of the stack has been reached.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments, request?: DebugProtocol.Request | undefined): void {
        const location: Location | undefined = this.runtime.activatedBreakpoint?.location;

        const stackFrame: StackFrame = {
            id: 0,
            name: 'Main',
            source: new Source(this.runtime.sourceFile),
            line: location ? location.line : 0,
            column: location ? location.column : 0,
            endLine: location ? location.endLine : 0,
            endColumn: location ? location.endColumn : 0
        };

        response.body = {
            stackFrames: [stackFrame]
        }

        this.sendResponse(response);
    }

    /**
     * The request returns the variable scopes for a given stackframe ID.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments, request?: DebugProtocol.Request | undefined): void {
        response.body = {
            scopes: [
                new Scope('AST', AST_ROOT_VARIABLES_REFERENCE, false),
                new Scope('Runtime State', RUNTIME_STATE_ROOT_VARIABLES_REFERENCE, false)
            ]
        };

        this.sendResponse(response);
    }

    /**
     * 
     * Retrieves all child variables for the given variable reference.
     * A filter can be used to limit the fetched children to either named or indexed children.
     * 
     * @param response 
     * @param args 
     * @param request 
     */
    protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request | undefined): Promise<void> {
        response.body = {
            variables: this.runtime.getVariables(args.variablesReference)
        };

        this.sendResponse(response);
    }

    protected async customRequest(command: string, response: DebugProtocol.Response, args: any, request?: DebugProtocol.Request | undefined): Promise<void> {

        switch (command) {
            case 'getBreakpointTypes':
                const res: GetBreakpointTypesResponse = {
                    breakpointTypes: this.runtime.breakpointManager.availableBreakpointTypes
                };

                response.body = res;

                break;

            case 'enableBreakpointTypes':
                this.runtime.breakpointManager.enableBreakpointTypes(args.breakpointTypeIds);

                break;

            default:
                this.sendErrorResponse(response, {
                    id: 100, format: '{_exception}', variables: {
                        _exception: 'Unknwon custom method ' + command + '.'
                    }
                });

                return;
        }

        this.sendResponse(response);
    }

    /**
     * Performs a step action and sends a stopped or terminated event based on the result of the action.
     * 
     * @param stepFunction The step function , i.e. {@link CustomDebugRuntime.nextStep}, 
     * {@link CustomDebugRuntime.stepInto} or {@link CustomDebugRuntime.stepOut}.
     */
    private async performStepAction(stepFunction: () => Promise<void>): Promise<void> {
        if (this.runtime.isExecutionDone) {
            // seq and type don't matter, they're changed inside sendEvent()
            this.sendEvent({
                event: 'terminated', seq: 1, type: 'event'
            });

            return;
        }

        await stepFunction.call(this.runtime);

        // seq and type don't matter, they're changed inside sendEvent()
        this.sendEvent({
            event: 'stopped', seq: 1, type: 'event', body: {
                reason: 'step',
                threadId: CustomDebugSession.threadID
            }
        });
    }
}