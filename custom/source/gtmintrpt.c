/*
	gtmintrpt
	
	Program to signal SIGUSR1 to GT.M Mumps processes.
	
	To compile on Linux, fist ensure you have 'gcc' installed (this is usually the case by default).
	At the command line issue the following command:

		gcc -o gtmintrpt gtmintrpt.c

	This should result in an executable file called gtmintrpt.
	To use it, just call it like any other program and pass the PID of the process you want to signal
	as a command line parameter. For example:
	
		./gtmintrpt 12345
	
	If no PID is provided, it will respond with some help text.
	
	To set it to signal GT.M processes owned by a different user do the following:

		chown <user> gtmintrpt
		chmod +sx gtmintrpt
	
	Where <user> is the user that owns the process that you want to signal.
	
	Stephen Chadwick, 22-Aug-2011.
*/
#include <sys/types.h>
#include <signal.h>
#include <stdlib.h>
#include <stdio.h>

int main (int argc, char *argv[]) {
	int pid = 0;
	if( argc == 2 ) pid = atoi( argv[1] );
	
	if( pid < 1 ) {
		printf("\n");
		printf("gtmintrpt: send a USR1 signal to a specified process ID.\n\n");
		printf("Usage:  gtmintrpt pid\n\n");
		printf("This is identical to 'kill -USR1 pid', the only difference being that the\n");
		printf("signal is hard-coded to USR1. The idea is that this executable can be set SUID\n");
		printf("relatively safely. This gets around problems with user permissions when trying\n");
		printf("to send an interrupt to a MUMPS process belonging to another user without\n");
		printf("having to run your own process as 'root'.\n\n");
		printf("It also runs silently (i.e. no output).\n\n");
		printf("To set SUID:\n");
		printf("  chown user gtmintrpt  # choose the user that the GT.M process that is to be\n");
		printf("                          signalled is running as - alternatively choose 'root'\n");
		printf("                          to be able to signal any process (not recommended!).\n");
		printf("  chmod +sx gtmintrpt\n\n");
		return 0;
	}
	kill( pid, SIGUSR1 );
	return 0;
}
